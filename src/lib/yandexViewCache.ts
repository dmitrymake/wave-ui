// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake

import type { NavigationEntry } from "./types/nav";

/**
 * Map a navigation stack entry to the Yandex view mode string. Pure: the root
 * entry (or no entry) is the dashboard; `yandex_*` views map to their suffix.
 */
export function getModeFromStack(view: NavigationEntry | undefined): string {
  if (!view || view.view === "root") return "dashboard";
  if (view.view.startsWith("yandex_")) return view.view.replace("yandex_", "");
  return "dashboard";
}

/**
 * Small Map-backed LRU cache for Yandex navigation views, keyed by mode + the
 * route data. Oldest entries are evicted once `maxSize` is exceeded. The cache
 * only stores/retrieves entries — applying a restored entry to the UI stores is
 * the caller's job.
 */
export class ViewCache<T> {
  private cache = new Map<string, T>();

  constructor(private maxSize = 20) {}

  key(mode: string, data: Record<string, unknown> | null | undefined): string {
    return mode + JSON.stringify(data || {});
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  set(key: string, entry: T): void {
    this.cache.set(key, entry);
    if (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}
