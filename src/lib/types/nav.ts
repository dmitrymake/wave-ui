// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// ─── Navigation ───

/** Menu tabs the shell can activate. Source tabs (e.g. "yandex") are registered
 *  by TrackSources via SourceRoute.menuTab; core tabs are listed here so a typo
 *  becomes a compile error instead of a silent fallback. */
export type CoreMenuTab =
  | "library"
  | "artists"
  | "albums"
  | "radio"
  | "playlists"
  | "favorites"
  | "search"
  | "queue"
  | "settings";
export type MenuTab = CoreMenuTab | (string & {});

/** Navigation views. Core views are enumerated; streaming sources (Yandex,
 *  future YouTube Music, …) own their views via SourceRoute.viewName, so the
 *  union stays open (`string & {}`) instead of hard-coding service literals. */
export type CoreView =
  | "root"
  | "details"
  | "albums_by_artist"
  | "tracks_by_album"
  | "queue"
  | "search";
export type ViewName = CoreView | (string & {});

/** Typed payloads for core views. Source views use their own shapes
 *  (e.g. { query }, { id }, { uid; kind }) but travel as NavData. */
export interface AlbumParams {
  name: string;
  artist?: string;
  displayName?: string;
}
export interface ArtistParams {
  name: string;
  displayName?: string;
}
export interface PlaylistParams {
  name: string;
  displayName?: string;
}
export interface SearchParams {
  query: string;
}

/** Data carried by a navigation entry. Open record for source extensibility,
 *  with the fields the router dedupes on spelled out. */
export type NavData = Record<string, unknown> & {
  name?: string;
  id?: string | number;
  uid?: string;
  kind?: string;
  query?: string;
  artist?: string;
  displayName?: string;
  title?: string;
};

export type NavigationEntry =
  | { view: "root"; data?: null }
  | { view: "details"; data: PlaylistParams & Record<string, unknown> }
  | { view: "albums_by_artist"; data: ArtistParams & Record<string, unknown> }
  | { view: "tracks_by_album"; data: AlbumParams & Record<string, unknown> }
  | { view: "search"; data?: (SearchParams & Record<string, unknown>) | null }
  | { view: "queue"; data?: null }
  | { view: ViewName; data?: NavData | null };

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
