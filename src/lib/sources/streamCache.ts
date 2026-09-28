// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Shared stream-metadata cache for streaming TrackSources (Yandex today,
// YouTube Music tomorrow). Extracted from yandexSource so the next service
// reuses the same trim/lookup semantics instead of copy-pasting them.

export const STREAM_CACHE_MAX = 300;
export const STREAM_CACHE_TRIM_TO = 200;

export function trimStreamCache<T>(cache: Record<string, T>): Record<string, T> {
  const keys = Object.keys(cache);
  if (keys.length <= STREAM_CACHE_MAX) return cache;
  const trimmed: Record<string, T> = {};
  for (const k of keys.slice(-STREAM_CACHE_TRIM_TO)) trimmed[k] = cache[k];
  return trimmed;
}

/** Extract a service-agnostic id from a stream url. Each source passes its own
 *  extractor (e.g. getYandexIdFromUrl); the cache logic stays neutral. */
export function lookupStreamCache<T extends { file: string }>(
  cache: Record<string, T> | undefined,
  url: string,
  getId: (url: string | null | undefined) => string | null,
): T | undefined {
  if (!cache) return undefined;
  const hit = cache[url];
  if (hit) return hit;
  const id = getId(url);
  if (id) return cache[String(id)];
  return undefined;
}
