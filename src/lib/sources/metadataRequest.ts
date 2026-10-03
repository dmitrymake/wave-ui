// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { HTTP_CONFIG } from "../constants";
import { TimeoutError } from "../http";

export const METADATA_RETRY_DELAY = 500;
export const METADATA_FAILURE_COOLDOWN = 30_000;

export function metadataRetryAllowed(failures: Map<string, number>, key: string): boolean {
  const retryAfter = failures.get(key);
  if (retryAfter === undefined) return true;
  if (Date.now() < retryAfter) return false;
  failures.delete(key);
  return true;
}

// Include response-body decoding in the deadline, not just the fetch to headers.
export async function withMetadataDeadline<T>(
  load: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([load(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function retryMetadataRequest<T>(
  load: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = HTTP_CONFIG.DEFAULT_TIMEOUT,
): Promise<T> {
  try {
    return await withMetadataDeadline(load, timeoutMs);
  } catch {
    await new Promise<void>((resolve) => setTimeout(resolve, METADATA_RETRY_DELAY));
    return withMetadataDeadline(load, timeoutMs);
  }
}
