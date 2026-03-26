// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { CONFIG } from "../../config";
import { connectionStatus, showToast } from "../store";
import { logger } from "../logger";

interface QueueEntry {
  cmd: string;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}

class MpdClient {
  socket: WebSocket | null;
  queue: QueueEntry[];
  isProcessing: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  watchdogTimer: ReturnType<typeof setTimeout> | null;
  _buffer: string;

  constructor() {
    this.socket = null;
    this.queue = [];
    this.isProcessing = false;
    this.reconnectTimer = null;
    this.watchdogTimer = null;
    this._buffer = "";
  }

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
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
    const port = CONFIG.WS_PORT || "8080";
    const wsUrl = `ws://${host}:${port}`;

    logger.log("[MPD] Connecting to:", wsUrl);

    try {
      this.socket = new WebSocket(wsUrl, ["binary"]);
    } catch (e) {
      logger.error("[MPD] Connection Error:", e);
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      return;
    }

    this.socket.onopen = (): void => {
      logger.log("[MPD] Connected");
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
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
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
    this.isProcessing = false;
    this._buffer = "";
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);

    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      entry.reject(new Error("Connection lost"));
    }
  }

  async _processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0 || !this.isConnected)
      return;

    this.isProcessing = true;
    const { cmd } = this.queue[0];

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

  async _handleMessage(event: MessageEvent): Promise<void> {
    let text: string = event.data;
    if (event.data instanceof Blob) {
      text = await event.data.text();
    }

    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    this._buffer += text;

    const isSuccess =
      this._buffer.endsWith("\nOK\n") || this._buffer === "OK\n";
    const isError = this._buffer.startsWith("ACK");

    if (isSuccess || isError) {
      const fullResponse = this._buffer;
      this._buffer = "";

      const currentRequest = this.queue.shift();
      this.isProcessing = false;

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
    } else {
      if (!this.queue.length) return;

      this.watchdogTimer = setTimeout(() => {
        logger.error("[MPD] Watchdog timeout receiving large data");
        if (this.socket) this.socket.close();
      }, 20000);
    }
  }
}

export const mpdClient = new MpdClient();
