// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// ─── Yandex ───

export interface YandexTrack {
  id: string | number;
  title: string;
  artist: string;
  album?: string;
  image?: string;
  time?: number;
  isYandex: true;
  // Stable list key (set when a Yandex stream is enriched into the queue). Optional
  // because freshly-fetched source rows don't have one yet; BaseList falls back to
  // the index. Declared so YandexTrack satisfies BaseList's `{ _uid?: string }` row
  // constraint without a cast.
  _uid?: string;
}

export interface YandexAlbum {
  id: string | number;
  title: string;
  artist?: string;
  image?: string;
  year?: number;
}

export interface YandexArtist {
  id: string | number;
  title: string;
  image?: string;
  description?: string;
}

export interface YandexPlaylist {
  uid: string;
  kind: string;
  title: string;
  cover?: string;
  trackCount?: number | string;
  id?: string;
  bgColor?: string;
  isStation?: boolean;
}

export interface YandexContext {
  streamCache: Record<string, YandexTrack & { file: string }>;
}

export interface YandexSearchResults {
  tracks: YandexTrack[];
  albums: YandexAlbum[];
  artists: YandexArtist[];
}

// ─── Yandex API responses ───
// Narrow shapes for the fields the UI actually reads off each endpoint. The PHP
// daemon proxies Yandex's API and may emit more, but the client only commits to
// these — anything extra is ignored rather than typed as `any`.

export interface YandexStatusResponse {
  authorized: boolean;
}

export interface YandexFavoritesIdsResponse {
  ids?: (string | number)[];
}

export interface YandexLandingResponse {
  personal?: YandexPlaylist[];
}

export interface YandexStationsDashboardResponse {
  stations?: YandexPlaylist[];
}

export interface YandexArtistDetailsResponse {
  artist?: { name?: string; description?: string };
  cover?: string;
  tracks?: YandexTrack[];
  albums?: YandexAlbum[];
}

export interface YandexAlbumDetailsResponse {
  title?: string;
  artist?: string;
  cover?: string;
  tracks?: YandexTrack[];
}

export interface YandexPlaylistTracksResponse {
  tracks?: YandexTrack[];
}

export interface YandexSearchResponse {
  tracks?: YandexTrack[];
  albums?: YandexAlbum[];
  artists?: YandexArtist[];
}

// play_playlist / add_tracks acknowledge with a status flag the UI toasts on.
export interface YandexMutationResponse {
  status?: string;
}

// ─── Yandex Content Header ───

export type YandexHeaderData = (YandexPlaylist | YandexArtist | YandexAlbum) & {
  name?: string;
  cover?: string;
  kind?: string;
  description?: string;
} | null;
