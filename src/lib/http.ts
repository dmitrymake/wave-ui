// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { HTTP_CONFIG } from "./constants";

/** Thrown when a request is aborted by its timeout (distinct from a user/abort). */
export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * fetch() with a hard client-side deadline.
 *
 * A plain fetch() never resolves on a half-open TCP connection (server alive
 * but silent) — the promise hangs until the browser's own multi-minute default,
 * stalling sync/daemon flows. This aborts via AbortController after `timeoutMs`
 * and rejects with TimeoutError so callers can surface a real error.
 *
 * Honours a caller-supplied `init.signal` too: if either the external signal or
 * the timeout fires, the request aborts.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = HTTP_CONFIG.DEFAULT_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Chain an externally-provided signal into our controller.
  const external = init.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    // Distinguish our timeout from other aborts/network errors.
    if (controller.signal.aborted && !(external && external.aborted)) {
      throw new TimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
