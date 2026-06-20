// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// http.ts reads HTTP_CONFIG.DEFAULT_TIMEOUT as the default arg; mock to avoid
// pulling the full constants module.
vi.mock("../constants", () => ({
  HTTP_CONFIG: { DEFAULT_TIMEOUT: 12000, DAEMON_POLL_TIMEOUT: 4000 },
}));

import { fetchWithTimeout, TimeoutError } from "../http";

// A fetch stub that mimics the real fetch: it stays pending until ITS signal
// aborts, then rejects with an AbortError (DOMException) — exactly what the
// browser does. Lets us exercise the timeout/abort branches deterministically.
function abortAwareFetch() {
  return vi.fn((_input: unknown, init: RequestInit = {}) => {
    return new Promise<Response>((_resolve, reject) => {
      const sig = init.signal;
      if (sig?.aborted) reject(new DOMException("aborted", "AbortError"));
      sig?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    });
  });
}

describe("fetchWithTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves with the response and passes an AbortSignal to fetch", async () => {
    const res = { ok: true } as Response;
    globalThis.fetch = vi.fn().mockResolvedValue(res);

    await expect(fetchWithTimeout("/x", {}, 1000)).resolves.toBe(res);

    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects with TimeoutError once the deadline elapses", async () => {
    globalThis.fetch = abortAwareFetch();

    const p = fetchWithTimeout("/x", {}, 5000);
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it("does not fire TimeoutError before the deadline", async () => {
    globalThis.fetch = abortAwareFetch();

    const p = fetchWithTimeout("/x", {}, 5000).catch((e) => e);
    await vi.advanceTimersByTimeAsync(4999);
    // Still pending: race a microtask sentinel against the (not-yet-rejected) call.
    const settled = await Promise.race([p, Promise.resolve("pending")]);
    expect(settled).toBe("pending");
  });

  it("clears the timeout timer after fetch settles (no dangling timer)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    await fetchWithTimeout("/x", {}, 1000);

    expect(clearSpy).toHaveBeenCalled();
  });

  it("propagates an external abort as a non-Timeout error", async () => {
    globalThis.fetch = abortAwareFetch();
    const ctrl = new AbortController();

    const p = fetchWithTimeout("/x", { signal: ctrl.signal }, 10000).catch((e) => e);
    ctrl.abort();
    const err = await p;

    expect(err).not.toBeInstanceOf(TimeoutError);
  });
});
