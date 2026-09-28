// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Pure navigation-target resolution for streaming content (Yandex today,
// YouTube Music tomorrow). Some API objects legitimately lack an id (rare
// search entries, hand-built rows): navigating those to a details view would
// fetch `.../undefined` and die with "Failed to load artist". Resolve to the
// details view when possible, fall back to a title search, and signal null
// when there is nothing navigable at all. Pure and unit-tested; the view
// performs the actual navigateTo/toast.
import type { YandexAlbum, YandexArtist } from "./types/yandex";

export interface ContentTarget {
  view: string;
  data: Record<string, unknown>;
}

function hasId(id: unknown): id is string | number {
  return (typeof id === "string" && id !== "") || typeof id === "number";
}

/** Where should opening this artist go? Details, title search, or nowhere. */
export function artistTarget(artist: YandexArtist | null | undefined): ContentTarget | null {
  if (!artist) return null;
  if (hasId(artist.id)) {
    return { view: "yandex_artist_details", data: artist as unknown as Record<string, unknown> };
  }
  if (artist.title) return { view: "yandex_search", data: { query: artist.title } };
  return null;
}

/** Where should opening this album go? Details, title search, or nowhere. */
export function albumTarget(album: YandexAlbum | null | undefined): ContentTarget | null {
  if (!album) return null;
  if (hasId(album.id)) {
    return { view: "yandex_album_details", data: album as unknown as Record<string, unknown> };
  }
  if (album.title) return { view: "yandex_search", data: { query: album.title } };
  return null;
}
