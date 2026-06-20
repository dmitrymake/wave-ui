// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { CONFIG } from "../../config";
import { connectionStatus } from "../store";
import { logger } from "../logger";

interface QueueEntry {
  cmd: string;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}

// Reconnect backoff: the first retry stays near-instant so a brief Wi-Fi blip
// recovers without a visible stall, then the delay grows exponentially up to a
// ceiling. Jitter spreads retries so several clients don't reconnect in lockstep.
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_JITTER_MS = 500;

// Exported as a pure function so the backoff schedule is unit-testable without a socket.
export function reconnectDelay(attempt: number): number {
  // attempt 0 -> base, 1 -> 2x, 2 -> 4x, … capped at the ceiling, plus a random
  // jitter in [0, RECONNECT_JITTER_MS) on top of the (capped) exponential term.
  const exp = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
  return exp + Math.random() * RECONNECT_JITTER_MS;
}

class MpdClient {
  socket: WebSocket | null;
  queue: QueueEntry[];
  current: QueueEntry | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  watchdogTimer: ReturnType<typeof setTimeout> | null;
  _buffer: string;
  _decoder: TextDecoder;

  constructor() {
    this.socket = null;
    this.queue = [];
    this.current = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.watchdogTimer = null;
    this._buffer = "";
    this._decoder = new TextDecoder();
  }

  // Schedule the next reconnect with exponential backoff + jitter, then advance the
  // attempt counter so a sustained outage keeps backing off toward the ceiling.
  _scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = reconnectDelay(this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  get isProcessing(): boolean {
    return this.current !== null;
  }

  connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    let host = CONFIG.MOODE_IP || window.location.hostname;
    host = host
      .replace(/^https?:\/\//, "")
      .split(":")[0]
      .split("/")[0];
    const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
    let wsUrl: string;
    if (isSecure) {
      const sslPort = window.location.port || "443";
      wsUrl = `wss://${host}:${sslPort}/ws`;
    } else {
      const port = CONFIG.WS_PORT || "8080";
      wsUrl = `ws://${host}:${port}`;
    }

    logger.log("[MPD] Connecting to:", wsUrl);

    try {
      this.socket = new WebSocket(wsUrl, ["binary"]);
      // Receive binary frames as ArrayBuffer so _handleMessage can decode them
      // synchronously. Decoding via Blob.text() (async) would let two back-to-back
      // frames append to _buffer out of arrival order and corrupt the response stream.
      this.socket.binaryType = "arraybuffer";
    } catch (e) {
      logger.error("[MPD] Connection Error:", e);
      this._scheduleReconnect();
      return;
    }

    this.socket.onopen = (): void => {
      logger.log("[MPD] Connected");
      // A clean open means the outage is over: reset the backoff so the next
      // disconnect again starts from the fast first retry.
      this.reconnectAttempts = 0;
      connectionStatus.set("Connected");
      this._processQueue();
    };

    this.socket.onmessage = (event: MessageEvent): void => {
      this._handleMessage(event);
    };

    this.socket.onclose = (e: CloseEvent): void => {
      logger.warn("[MPD] Socket closed", e.code, e.reason);
      connectionStatus.set("Disconnected");
      this._cleanup();
      this._scheduleReconnect();
    };

    this.socket.onerror = (err: Event): void => {
      logger.error("[MPD] Socket error", err);
    };
  }

  send(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ cmd, resolve, reject });
      this._processQueue();
    });
  }

  _cleanup(): void {
    this._buffer = "";
    // Drop any partial multi-byte sequence held by the streaming decoder so a
    // mid-frame disconnect cannot bleed bytes into the next connection's stream.
    this._decoder = new TextDecoder();
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    if (this.current) {
      this.current.reject(new Error("Connection lost"));
      this.current = null;
    }
    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      entry.reject(new Error("Connection lost"));
    }
  }

  _processQueue(): void {
    if (this.current || this.queue.length === 0 || !this.isConnected) return;

    this.current = this.queue.shift()!;
    const { cmd } = this.current;

    // Single overall deadline per command, established when the command is sent.
    // Incoming frames do not re-arm it, so a slow byte-by-byte trickle can no longer
    // postpone the timeout indefinitely.
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      logger.error("[MPD] Watchdog timeout");
      if (this.socket) this.socket.close();
    }, 20000);

    try {
      const payload = cmd.endsWith("\n") ? cmd : cmd + "\n";
      this.socket!.send(new TextEncoder().encode(payload));
    } catch (e) {
      logger.error("[MPD] Send error", e);
      this._cleanup();
    }
  }

  // Only text MPD responses are supported over this socket. Binary commands
  // (albumart/readpicture) would interleave raw image bytes that this UTF-8 / "\nOK\n"
  // framing cannot parse, so cover art is fetched over HTTP instead.
  //
  // This handler MUST stay synchronous. The socket uses binaryType "arraybuffer",
  // so frames decode here without awaiting; an await between frame arrival and the
  // `this._buffer` append would let two back-to-back frames be appended out of order
  // and misattribute a reply to the wrong queued command. The streaming TextDecoder
  // also stitches multi-byte UTF-8 sequences split across frame boundaries.
  _handleMessage(event: MessageEvent): void {
    const data: unknown = event.data;
    let text: string;
    if (typeof data === "string") {
      text = data;
    } else if (data != null && typeof (data as { byteLength?: unknown }).byteLength === "number") {
      // ArrayBuffer (binaryType "arraybuffer") or a typed-array view. Normalise to a
      // Uint8Array in this realm before decoding — the Uint8Array constructor's
      // buffer brand check is realm-independent, so cross-realm buffers (and the
      // jsdom test environment) decode uniformly where `instanceof ArrayBuffer` would not.
      const view: Uint8Array =
        data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBufferLike);
      text = this._decoder.decode(view, { stream: true });
    } else {
      // Unexpected frame type under binaryType "arraybuffer" — ignore defensively
      // rather than corrupt the buffer with a stringified object.
      logger.warn("[MPD] Ignoring unexpected frame type", typeof data);
      return;
    }

    this._buffer += text;

    const isSuccess =
      this._buffer.endsWith("\nOK\n") || this._buffer === "OK\n";
    const isError = this._buffer.startsWith("ACK");

    if (!isSuccess && !isError) {
      // Incomplete response — keep buffering. The send-time watchdog still bounds
      // the overall deadline, so it is intentionally not re-armed here.
      return;
    }

    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    const fullResponse = this._buffer;
    this._buffer = "";

    const currentRequest = this.current;
    this.current = null;

    if (currentRequest) {
      if (isError) {
        logger.error(
          `[MPD] Error for "${currentRequest.cmd.trim()}": ${fullResponse.trim()}`,
        );
        currentRequest.reject(new Error(fullResponse.trim()));
      } else {
        const cleanResult = fullResponse
          .replace(/\nOK\n$/, "")
          .replace(/^OK\n$/, "");
        currentRequest.resolve(cleanResult);
      }
    }

    this._processQueue();
  }
}

export const mpdClient = new MpdClient();
