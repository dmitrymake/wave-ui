// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// ─── Navigation ───

export interface NavigationEntry {
  view: string;
  data?: Record<string, unknown> | null;
}

/**
 * A source-owned route, declaring how a hash path round-trips to a navigation
 * view+data for tracks owned by a {@link TrackSource}. Carries enough to drive
 * BOTH directions so the router stays source-agnostic: it never hard-codes a
 * service's route literals — it looks the route up by prefix (parse) or by view
 * (serialize) and delegates the path<->data mapping back to the source.
 */
export interface SourceRoute {
  /** First hash segment that identifies this route, e.g. "yandex_album". */
  routePrefix: string;
  /** Navigation view this route maps to, e.g. "yandex_album_details". */
  viewName: string;
  /**
   * Menu tab to activate when this route is parsed (e.g. "yandex"). Also marks
   * the segment that, when seen bare (no trailing parts), is this source's tab
   * root: the router resets the stack to root instead of pushing a detail view.
   */
  menuTab?: string;
  /**
   * Parse the parts AFTER the prefix into navigation data. Return null when the
   * parts are insufficient (the router then leaves data undefined, exactly as the
   * old per-route `parts.length >= N` guards did).
   */
  parseParams(parts: string[]): Record<string, unknown> | null;
  /**
   * Serialize navigation data into a FULL hash path including the prefix
   * (e.g. "yandex_album/123"). Return null when the data is insufficient.
   */
  buildPath(data: Record<string, unknown> | null): string | null;
  /**
   * Push this view onto the stack even when parsing yielded no data (the
   * yandex_search empty-query case), and serialize/replace it like a search.
   */
  allowEmptyData?: boolean;
}
