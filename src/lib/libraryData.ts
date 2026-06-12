// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { db } from "./db";
import { formatTotalDuration } from "./utils";
import type { NavigationEntry, LibraryItem } from "./types";

export interface LibraryHeader {
  headerItem?: LibraryItem;
  trackCount: number;
  totalDuration: string;
  quality: string;
  subtitle: string;
}

export interface LibraryViewData {
  items: LibraryItem[];
  header: LibraryHeader;
}

/**
 * Load and normalize the items for a library view (root artists/albums, an
 * artist's albums, or an album's tracks) plus the derived header metadata.
 * Pure data access — the caller owns loading/abort state and the stores.
 */
export async function loadLibraryView(
  category: string,
  viewState: NavigationEntry,
): Promise<LibraryViewData> {
  const data = (await fetchRows(category, viewState)) as Record<string, unknown>[];

  const items: LibraryItem[] = data.map((raw, idx) => {
    const obj: Record<string, unknown> =
      typeof raw === "string" ? { name: raw } : raw;

    let yStr = String(obj.year || "");
    if (yStr.length > 4) yStr = yStr.substring(0, 4);

    return {
      ...obj,
      displayName: (obj.name || obj.title || obj.artist || "Unknown") as string,
      thumbFile: (obj.file as string) || null,
      year: yStr,
      _uid: (obj.file || obj.name || idx) + category + viewState.view,
    } as LibraryItem;
  });

  const header: LibraryHeader = {
    trackCount: 0,
    totalDuration: "",
    quality: "",
    subtitle: "",
  };

  if (viewState.view === "tracks_by_album" && items.length > 0) {
    header.headerItem = items[0];
    header.trackCount = items.length;
    header.subtitle = items[0].year;

    const totalSec = items.reduce((acc, t) => acc + (t.time || 0), 0);
    header.totalDuration = formatTotalDuration(totalSec);
    if (items[0].qualityBadge) header.quality = items[0].qualityBadge;
  }

  return { items, header };
}

async function fetchRows(
  category: string,
  viewState: NavigationEntry,
): Promise<unknown[]> {
  const vdata = viewState.data as { name?: string; artist?: string } | string;

  if (viewState.view === "root") {
    return category === "artists" ? db.getArtists() : db.getAlbums();
  }
  if (viewState.view === "albums_by_artist") {
    const artistName = (typeof vdata === "object" ? vdata.name : vdata) || "";
    return db.getArtistAlbums(artistName as string);
  }
  if (viewState.view === "tracks_by_album") {
    const albumName = (typeof vdata === "object" ? vdata.name : vdata) || "";
    const artistName = typeof vdata === "object" ? vdata.artist : undefined;
    return db.getAlbumTracks(albumName as string, artistName);
  }
  return [];
}
