import { CONFIG } from "../../config";
import { connectionStatus, showToast } from "../store";

class MpdClient {
  constructor() {
    this.socket = null;
    this.queue = [];
    this.isProcessing = false;
    this.reconnectTimer = null;
    this.watchdogTimer = null;
    this._buffer = "";
  }

  get isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  connect() {
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

    console.log("[MPD] Connecting to:", wsUrl);

    try {
      this.socket = new WebSocket(wsUrl, ["binary"]);
    } catch (e) {
      console.error("[MPD] Connection Error:", e);
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      return;
    }

    this.socket.onopen = () => {
      console.log("[MPD] Connected");
      connectionStatus.set("Connected");
      // showToast("Connected to Moode", "success"); // Скрыл, чтобы не спамило
      this._processQueue();
    };

    this.socket.onmessage = (event) => this._handleMessage(event);

    this.socket.onclose = (e) => {
      console.warn("[MPD] Socket closed", e.code, e.reason);
      connectionStatus.set("Disconnected");
      this._cleanup();
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.socket.onerror = (err) => {
      console.error("[MPD] Socket error", err);
    };
  }

  send(cmd) {
    return new Promise((resolve, reject) => {
      // console.log(`[MPD] Enqueue: ${cmd.substring(0, 50)}`);
      this.queue.push({ cmd, resolve, reject });
      this._processQueue();
    });
  }

  _cleanup() {
    this.isProcessing = false;
    this._buffer = "";
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);

    while (this.queue.length > 0) {
      const { reject } = this.queue.shift();
      reject(new Error("Connection lost"));
    }
  }

  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0 || !this.isConnected)
      return;

    this.isProcessing = true;
    const { cmd } = this.queue[0];

    // console.log(`[MPD] >>> SEND: ${cmd.trim()}`);

    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      console.error("[MPD] Watchdog timeout");
      if (this.socket) this.socket.close();
    }, 20000);

    try {
      const payload = cmd.endsWith("\n") ? cmd : cmd + "\n";
      this.socket.send(new TextEncoder().encode(payload));
    } catch (e) {
      console.error("[MPD] Send error", e);
      this._cleanup();
    }
  }

  async _handleMessage(event) {
    let text = event.data;
    if (text instanceof Blob) {
      text = await text.text();
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
          console.error(
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
        console.error("[MPD] Watchdog timeout receiving large data");
        if (this.socket) this.socket.close();
      }, 20000);
    }
  }
}

export const mpdClient = new MpdClient();
