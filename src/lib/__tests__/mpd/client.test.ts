// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("../../../config", () => ({
  CONFIG: {
    MOODE_IP: "192.168.1.100",
    WS_PORT: "8080",
  },
}));

vi.mock("../../store", () => ({
  connectionStatus: { set: vi.fn() },
  showToast: vi.fn(),
}));

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  protocols: string | string[] | undefined;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | Blob }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: (() => void) | null;
  _sent: string[];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._sent = [];

    // Auto-connect after microtask
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 0);
  }

  send(data: string) {
    this._sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1000, reason: "test" });
  }
}

(globalThis as Record<string, unknown>).WebSocket = MockWebSocket;

describe("MpdClient", () => {
  let mpdClient: Record<string, any>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import("../../mpd/client.js");
    mpdClient = mod.mpdClient;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (mpdClient.socket) {
      mpdClient.socket.readyState = MockWebSocket.CLOSED;
    }
    mpdClient._cleanup();
  });

  it("starts disconnected", () => {
    expect(mpdClient.isConnected).toBeFalsy();
    expect(mpdClient.socket).toBeNull();
  });

  it("connects via WebSocket", async () => {
    mpdClient.connect();
    expect(mpdClient.socket).toBeDefined();
    expect(mpdClient.socket.url).toBe("ws://192.168.1.100:8080");
  });

  it("queues commands and resolves on OK", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    const promise = mpdClient.send("status");
    await vi.advanceTimersByTimeAsync(0);

    // Simulate response
    await mpdClient._handleMessage({ data: "volume: 50\nOK\n" });
    const result = await promise;
    expect(result).toBe("volume: 50");
  });

  it("rejects on ACK error", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    const promise = mpdClient.send("badcommand");
    await vi.advanceTimersByTimeAsync(0);

    await mpdClient._handleMessage({ data: 'ACK [5@0] {} unknown command "badcommand"' });
    await expect(promise).rejects.toThrow("ACK");
  });

  it("handles Blob messages", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    const promise = mpdClient.send("status");
    await vi.advanceTimersByTimeAsync(0);

    const blob = new Blob(["state: play\nOK\n"]);
    await mpdClient._handleMessage({ data: blob });
    const result = await promise;
    expect(result).toBe("state: play");
  });

  it("cleanup rejects pending commands", () => {
    mpdClient.connect();
    const promise = mpdClient.send("test");
    mpdClient._cleanup();
    return expect(promise).rejects.toThrow("Connection lost");
  });

  it("buffers partial messages", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    const promise = mpdClient.send("status");
    await vi.advanceTimersByTimeAsync(0);

    // Send in two parts
    await mpdClient._handleMessage({ data: "volume: 50\n" });
    // Not resolved yet — no OK
    await mpdClient._handleMessage({ data: "state: play\nOK\n" });

    const result = await promise;
    expect(result).toBe("volume: 50\nstate: play");
  });
});
