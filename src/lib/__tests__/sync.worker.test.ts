// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// db.replaceAll is the only side effect the worker performs; spy on it so we can
// assert the atomic swap happened (or didn't) without touching IndexedDB.
const replaceAll = vi.hoisted(() => vi.fn(async (_tracks: unknown[]) => {}));
vi.mock("../db", () => ({
  db: { replaceAll },
}));

// NOTE: trackMapper is intentionally NOT mocked here — the worker must be
// exercised against the real mapRawTrack, otherwise a normalization regression
// (NFC, albumKey, defaults) stays green while production corrupts data.

// Capture everything the worker posts back to the main thread.
interface WorkerOut {
  type: string;
  status?: string;
  count?: number;
  message?: string;
}
const posted: WorkerOut[] = [];

type WorkerHost = {
  postMessage: (m: WorkerOut) => void;
  onmessage: ((e: { data: { type: string; payload: { url: string } } }) => Promise<void>) | null;
};
const workerSelf = self as unknown as WorkerHost;

// Assignments to workerSelf.onmessage narrow its read type to null in this
// scope, so arm through a function boundary (narrowing doesn't cross it).
function armWorkerHost(): void {
  workerSelf.postMessage = (m) => posted.push(m);
  workerSelf.onmessage = null;
}

// Drive the worker by importing it fresh (it registers self.onmessage at load),
// then invoking that handler with a START_SYNC message.
async function runSync(url: string): Promise<void> {
  posted.length = 0;
  vi.resetModules();
  armWorkerHost();
  await import("../workers/sync.worker.js");
  // The handler is async; await its returned promise so all posts have landed.
  const handler = workerSelf.onmessage;
  if (handler) await handler({ data: { type: "START_SYNC", payload: { url } } });
}

beforeEach(() => {
  replaceAll.mockClear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sync.worker message flow", () => {
  it("posts PROGRESS stages then DONE with the track count on success", async () => {
    const rows = [{ file: "a.flac" }, { file: "b.flac" }, { file: "c.flac" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(rows),
      })),
    );

    await runSync("/api/library");

    const types = posted.map((p) => p.type);
    // The connecting → downloading → parsing → saving → DONE progression.
    expect(types).toEqual(["PROGRESS", "PROGRESS", "PROGRESS", "PROGRESS", "DONE"]);

    const statuses = posted.filter((p) => p.type === "PROGRESS").map((p) => p.status);
    expect(statuses).toEqual(["connecting", "downloading", "parsing", "saving"]);

    const done = posted.find((p) => p.type === "DONE");
    expect(done?.count).toBe(3);

    // The atomic swap received exactly the mapped rows.
    expect(replaceAll).toHaveBeenCalledTimes(1);
    expect(replaceAll.mock.calls[0][0]).toHaveLength(3);
  });

  it("skips invalid rows instead of aborting the whole sync", async () => {
    const rows = [{ file: "a.flac" }, null, 42, { title: "no file" }, { file: "b.flac" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(rows),
      })),
    );

    await runSync("/api/library");

    // Only the two valid rows land; the sync completes instead of ERRORing.
    const done = posted.find((p) => p.type === "DONE");
    expect(done?.count).toBe(2);
    expect(posted.some((p) => p.type === "ERROR")).toBe(false);
    expect(replaceAll).toHaveBeenCalledTimes(1);
    expect(replaceAll.mock.calls[0][0]).toHaveLength(2);
  });

  it("treats an empty JSON object as an empty library (DONE count 0, no error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" })),
    );

    await runSync("/api/library");

    const done = posted.find((p) => p.type === "DONE");
    expect(done).toBeDefined();
    expect(done?.count).toBe(0);
    expect(posted.some((p) => p.type === "ERROR")).toBe(false);
  });

  it("posts ERROR (and never swaps the cache) on a non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, text: async () => "down" })),
    );

    await runSync("/api/library");

    const err = posted.find((p) => p.type === "ERROR");
    expect(err).toBeDefined();
    expect(err?.message).toContain("503");
    expect(posted.some((p) => p.type === "DONE")).toBe(false);
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it("posts ERROR when the server returns non-JSON text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "<html>error page</html>",
      })),
    );

    await runSync("/api/library");

    const err = posted.find((p) => p.type === "ERROR");
    expect(err).toBeDefined();
    expect(err?.message).toContain("Invalid JSON");
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it("posts ERROR on an empty response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => "   " })),
    );

    await runSync("/api/library");

    const err = posted.find((p) => p.type === "ERROR");
    expect(err).toBeDefined();
    expect(err?.message).toContain("empty");
  });

  it("surfaces an API error object as ERROR rather than DONE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ error: "db locked" }),
      })),
    );

    await runSync("/api/library");

    const err = posted.find((p) => p.type === "ERROR");
    expect(err).toBeDefined();
    expect(err?.message).toContain("db locked");
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it("ignores messages whose type is not START_SYNC", async () => {
    vi.stubGlobal("fetch", vi.fn());
    posted.length = 0;
    vi.resetModules();
    workerSelf.postMessage = (m) => posted.push(m);
    await import("../workers/sync.worker.js");
    await workerSelf.onmessage?.({ data: { type: "PING", payload: { url: "/x" } } });

    expect(posted).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
