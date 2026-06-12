// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { mpdClient } from "./mpd/client";
import { MpdParser } from "./mpd/parser";
import { logger } from "./logger";
import type { Track, Playlist } from "./types";

export interface PlaylistSearchGroup {
  playlist: Playlist;
  tracks: Track[];
}

export interface PlaylistSearchResult {
  matchedPlaylists: Playlist[];
  groups: PlaylistSearchGroup[];
}

/**
 * Deep-search every playlist (except Favorites) for tracks whose title or artist
 * contains `query`. Groups are emitted incrementally through onPartial as each
 * playlist is scanned, and the scan stops cleanly once `signal` aborts (a newer
 * search has started).
 */
export async function searchPlaylists(
  query: string,
  playlists: Playlist[],
  signal: AbortSignal,
  onPartial?: (groups: PlaylistSearchGroup[]) => void,
): Promise<PlaylistSearchResult> {
  const q = query.toLowerCase();
  const matchedPlaylists = playlists.filter((p) =>
    p.name.toLowerCase().includes(q),
  );

  const groups: PlaylistSearchGroup[] = [];
  const targets = playlists.filter((p) => p.name !== "Favorites");

  for (const pl of targets) {
    if (signal.aborted) break;
    try {
      const raw = await mpdClient.send(
        `listplaylistinfo "${pl.name.replace(/"/g, '\\"')}"`,
      );
      if (signal.aborted) break;

      const matches: Track[] = MpdParser.parseTracks(raw)
        .map((t, i) => ({ ...t, playlistPos: i }))
        .filter(
          (t) =>
            (t.title && t.title.toLowerCase().includes(q)) ||
            (t.artist && t.artist.toLowerCase().includes(q)),
        )
        .map((t) => ({ ...t, _uid: `${pl.name}-${t.playlistPos}` }));

      if (matches.length > 0) {
        groups.push({ playlist: pl, tracks: matches });
        onPartial?.([...groups]);
      }
    } catch (e) {
      logger.warn(`Failed to search in playlist ${pl.name}`, e);
    }
  }

  return { matchedPlaylists, groups };
}
