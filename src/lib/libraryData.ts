// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { db } from "./db";
import { formatTotalDuration } from "./utils";
import { isRecord, asString, asOptionalNumber } from "./validate";
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
  const rows: unknown[] = await fetchRows(category, viewState);

  const items: LibraryItem[] = rows.map((raw, idx) => {
    const obj: Record<string, unknown> = isRecord(raw)
      ? raw
      : typeof raw === "string"
        ? { name: raw }
        : {};

    const name = asString(obj.name);
    const file = asString(obj.file);
    let yStr = asString(obj.year);
    if (yStr.length > 4) yStr = yStr.substring(0, 4);

    return {
      name: name || undefined,
      title: asString(obj.title) || undefined,
      artist: asString(obj.artist) || undefined,
      album: asString(obj.album) || undefined,
      track: asString(obj.track) || undefined,
      file: file || undefined,
      displayName: asString(obj.name || obj.title || obj.artist, "Unknown"),
      thumbFile: file || null,
      year: yStr,
      _uid: `${file || name || idx}${category}${viewState.view}`,
      time: asOptionalNumber(obj.time),
      qualityBadge: asString(obj.qualityBadge) || undefined,
      thumbHash: asString(obj.thumbHash) || undefined,
    };
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
  const vdata: unknown = viewState.data;
  const vobj: Record<string, unknown> | null = isRecord(vdata) ? vdata : null;
  // Navigation payloads are objects, but tolerate a bare string for safety.
  const vname = (key: string): string =>
    typeof vdata === "string" && key === "name" ? vdata : asString(vobj?.[key]);

  if (viewState.view === "root") {
    return category === "artists" ? db.getArtists() : db.getAlbums();
  }
  if (viewState.view === "albums_by_artist") {
    return db.getArtistAlbums(vname("name"));
  }
  if (viewState.view === "tracks_by_album") {
    return db.getAlbumTracks(vname("name"), vname("artist") || null);
  }
  return [];
}
