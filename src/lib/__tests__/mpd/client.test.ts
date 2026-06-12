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

// Persistent spy on connectionStatus.set, hoisted so it survives vi.resetModules()
// and stays the same instance both the client and the assertions observe.
const connectionSetSpy = vi.hoisted(() => vi.fn());

vi.mock("../../store", () => ({
  connectionStatus: { set: connectionSetSpy },
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

describe("reconnectDelay (backoff schedule)", () => {
  let reconnectDelay: (attempt: number) => number;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../mpd/client.js");
    reconnectDelay = mod.reconnectDelay;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grows exponentially from the base on early attempts", () => {
    // Pin jitter to 0 so the exponential term is observed exactly.
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(reconnectDelay(0)).toBe(500); // base
    expect(reconnectDelay(1)).toBe(1000); // 2x
    expect(reconnectDelay(2)).toBe(2000); // 4x
    expect(reconnectDelay(3)).toBe(4000); // 8x
  });

  it("keeps the first retry fast for short Wi-Fi blips", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // Sub-second first retry so a brief drop recovers without a visible stall.
    expect(reconnectDelay(0)).toBeLessThan(1000);
  });

  it("caps the exponential term at the ceiling for sustained outages", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // 2**20 * 500 would be enormous; the cap holds it at 30000.
    expect(reconnectDelay(20)).toBe(30000);
    expect(reconnectDelay(100)).toBe(30000);
  });

  it("adds bounded jitter on top of the capped delay", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    // Max jitter (~500ms) pushes the ceiling case just above 30000 but under 30500.
    const d = reconnectDelay(20);
    expect(d).toBeGreaterThan(30000);
    expect(d).toBeLessThan(30500);
  });
});

describe("MpdClient", () => {
  let mpdClient: Record<string, any>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    connectionSetSpy.mockClear();
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

  it("handles binary (ArrayBuffer) messages", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    const promise = mpdClient.send("status");
    await vi.advanceTimersByTimeAsync(0);

    const buf = new TextEncoder().encode("state: play\nOK\n").buffer;
    mpdClient._handleMessage({ data: buf });
    const result = await promise;
    expect(result).toBe("state: play");
  });

  it("assembles consecutive binary frames in arrival order (no async reorder)", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    const promise = mpdClient.send("status");
    await vi.advanceTimersByTimeAsync(0);

    // Two frames delivered back-to-back. A synchronous handler must append them in
    // strict arrival order; the old async Blob.text() path could reorder them.
    const enc = new TextEncoder();
    mpdClient._handleMessage({ data: enc.encode("volume: 50\n").buffer });
    mpdClient._handleMessage({ data: enc.encode("state: play\nOK\n").buffer });

    const result = await promise;
    expect(result).toBe("volume: 50\nstate: play");
  });

  it("stitches a multi-byte UTF-8 char split across two binary frames", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    const promise = mpdClient.send("currentsong");
    await vi.advanceTimersByTimeAsync(0);

    // "café": the é (U+00E9) encodes to bytes 0xC3 0xA9. Split the stream between
    // those two bytes so each frame alone is an incomplete UTF-8 sequence.
    const full = new TextEncoder().encode("Title: café\nOK\n");
    const split = 11; // after "Title: caf" (10 bytes) + first byte of é
    mpdClient._handleMessage({ data: full.slice(0, split).buffer });
    mpdClient._handleMessage({ data: full.slice(split).buffer });

    const result = await promise;
    expect(result).toBe("Title: café");
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

  it("sets connectionStatus to Connected on socket open", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);
    expect(connectionSetSpy).toHaveBeenCalledWith("Connected");
  });

  it("sets connectionStatus to Disconnected when the socket closes", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);
    connectionSetSpy.mockClear();

    mpdClient.socket.close();
    expect(connectionSetSpy).toHaveBeenCalledWith("Disconnected");
  });

  it("schedules a reconnect after an unexpected close", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    mpdClient.socket.close();
    // A reconnect timer must be armed so the client recovers on its own.
    expect(mpdClient.reconnectTimer).not.toBeNull();
    expect(mpdClient.reconnectAttempts).toBeGreaterThan(0);
  });

  it("resets the reconnect attempt counter after a successful reopen", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    // First drop bumps the attempt counter…
    mpdClient.socket.close();
    expect(mpdClient.reconnectAttempts).toBe(1);

    // …then the scheduled reconnect opens a fresh socket and clears the counter,
    // so the next outage again starts from the fast first retry.
    await vi.advanceTimersByTimeAsync(35000);
    expect(mpdClient.isConnected).toBe(true);
    expect(mpdClient.reconnectAttempts).toBe(0);
  });

  it("watchdog closes the socket and rejects a command that never replies", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    // Command is sent but no frame ever arrives. The single send-time deadline must
    // fire and tear the socket down so the promise rejects rather than hanging forever.
    const promise = mpdClient.send("idle");
    // Attach the rejection expectation up-front so the rejection that fires inside a
    // later timer tick is always handled (no unhandled-rejection noise).
    const settled = expect(promise).rejects.toThrow("Connection lost");
    await vi.advanceTimersByTimeAsync(0);
    expect(mpdClient.watchdogTimer).not.toBeNull();

    // Just before the deadline the command is still pending…
    await vi.advanceTimersByTimeAsync(19000);
    // …and past 20s the watchdog closes the socket, whose onclose rejects via _cleanup.
    await vi.advanceTimersByTimeAsync(2000);

    await settled;
    expect(mpdClient.current).toBeNull();
  });

  it("watchdog deadline is NOT re-armed by incomplete frames (no indefinite postpone)", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    const promise = mpdClient.send("listallinfo");
    const settled = expect(promise).rejects.toThrow("Connection lost");
    await vi.advanceTimersByTimeAsync(0);

    // A slow trickle of partial frames (never terminated by "\nOK\n"). Each arrives
    // after most of the deadline has elapsed; the deadline must still hold so the
    // overall command cannot be postponed forever.
    const enc = new TextEncoder();
    await vi.advanceTimersByTimeAsync(15000);
    mpdClient._handleMessage({ data: enc.encode("file: a\n").buffer });
    await vi.advanceTimersByTimeAsync(6000); // crosses the original 20s deadline

    await settled;
  });

  it("onclose rejects both the in-flight command and the whole pending queue", async () => {
    mpdClient.connect();
    await vi.advanceTimersByTimeAsync(10);

    // One command becomes current; the rest sit queued behind it.
    const inFlight = mpdClient.send("status");
    const queued1 = mpdClient.send("currentsong");
    const queued2 = mpdClient.send("playlistinfo");
    await vi.advanceTimersByTimeAsync(0);

    expect(mpdClient.current).not.toBeNull();
    expect(mpdClient.queue.length).toBe(2);

    const allRejected = Promise.all([
      expect(inFlight).rejects.toThrow("Connection lost"),
      expect(queued1).rejects.toThrow("Connection lost"),
      expect(queued2).rejects.toThrow("Connection lost"),
    ]);

    mpdClient.socket.close();

    await allRejected;
    expect(mpdClient.current).toBeNull();
    expect(mpdClient.queue.length).toBe(0);
  });
});
