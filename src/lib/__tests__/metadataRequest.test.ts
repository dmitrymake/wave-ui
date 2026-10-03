// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError } from "../http";
import {
  METADATA_RETRY_DELAY,
  metadataRetryAllowed,
  retryMetadataRequest,
  withMetadataDeadline,
} from "../sources/metadataRequest";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("metadata request deadlines and retries", () => {
  it("returns successful metadata without retrying", async () => {
    const load = vi.fn().mockResolvedValue({ title: "Song" });
    await expect(retryMetadataRequest(load)).resolves.toEqual({ title: "Song" });
    expect(load).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the request pending through a short backoff before one retry", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue("Song");
    const result = retryMetadataRequest(load);
    await vi.advanceTimersByTimeAsync(METADATA_RETRY_DELAY - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("Song");
    expect(load).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects after the final failure instead of retrying forever", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Offline"));
    const settled = expect(retryMetadataRequest(load)).rejects.toThrow("Offline");
    await vi.advanceTimersByTimeAsync(METADATA_RETRY_DELAY);
    await settled;
    expect(load).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts and rejects a stalled request even when it ignores the abort signal", async () => {
    let signal: AbortSignal | undefined;
    const load = vi.fn((requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<never>(() => {});
    });
    const settled = expect(withMetadataDeadline(load, 100)).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await settled;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds both attempts when neither request settles", async () => {
    const load = vi.fn(() => new Promise<never>(() => {}));
    const settled = expect(retryMetadataRequest(load, 100)).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(200 + METADATA_RETRY_DELAY);
    await settled;
    expect(load).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows recovery after the failure cooldown expires", () => {
    const failures = new Map([["track", Date.now() + 1000]]);
    expect(metadataRetryAllowed(failures, "track")).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(metadataRetryAllowed(failures, "track")).toBe(true);
    expect(failures.has("track")).toBe(false);
  });
});
