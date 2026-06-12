// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { get } from "svelte/store";
import { mpdClient } from "./client";
import { MpdParser } from "./parser";
import { escapeArg, escapePath } from "./escape";
import {
  isLoadingPlaylists,
  playlists,
  isLoadingTracks,
  activePlaylistTracks,
  activePlaylistName,
  showToast,
  favorites,
} from "../store";
import { db } from "../db";
import { generateUid, isRemoteUrl } from "../utils";
import { MSG } from "../messages";
import { logger } from "../logger";
import { getGradient, assignColorVar } from "../playlistColor";
import type { Track, Playlist } from "../types";

// Re-exported for backward compatibility: the colour helpers used to live here
// before being centralised in playlistColor.ts. Keeps any import path stable.
export { getGradient, assignColorVar } from "../playlistColor";

const FAV_PLAYLIST: string = "Favorites";

let _favActionQueue: Promise<void> = Promise.resolve();

const normFile = (path: string | null | undefined): string => {
  if (!path) return "";
  try {
    let p: string = decodeURIComponent(path).normalize("NFC");
    if (p.startsWith("/")) p = p.slice(1);
    return p.trim().toLowerCase();
  } catch (e) {
    return String(path).toLowerCase();
  }
};

const cleanUrl = (url: string | null | undefined): string => {
  if (!url) return "";
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("?")[0]
    .replace(/\/$/, "");
};

export const LibraryActions = {
  async loadPlaylists(): Promise<void> {
    isLoadingPlaylists.set(true);
    try {
      const text: string = await mpdClient.send("listplaylists");
      const rawPlaylists: Playlist[] = MpdParser.parsePlaylists(text);

      const enhanced = rawPlaylists.map((pl) => ({
        ...pl,
        color: getGradient(pl.name),
        colorVar: assignColorVar(pl.name),
      }));

      playlists.set(enhanced);
    } catch (e) {
      logger.error(e);
    } finally {
      isLoadingPlaylists.set(false);
    }
  },

  async createEmptyPlaylist(name: string): Promise<void> {
    if (!name) return;
    const safeName: string = escapeArg(name);
    try {
      await mpdClient.send(`save "${safeName}"`);
      await mpdClient.send(`playlistclear "${safeName}"`);
      showToast(MSG.playlistCreated(name), "success");
      await this.loadPlaylists();
    } catch (e) {
      logger.error(e);
      showToast(MSG.PL_FAILED_CREATE, "error");
    }
  },

  async saveQueueAsPlaylist(name: string): Promise<void> {
    if (!name) return;
    const safeName: string = escapeArg(name);
    try {
      await mpdClient.send(`save "${safeName}"`);
      showToast(MSG.playlistCreated(name), "success");
      await this.loadPlaylists();
    } catch (e) {
      logger.error(e);
      showToast(MSG.PL_FAILED_CREATE, "error");
    }
  },

  async deletePlaylist(name: string): Promise<void> {
    if (!name) return;
    const safeName: string = escapeArg(name);
    try {
      await mpdClient.send(`rm "${safeName}"`);
      showToast(MSG.PL_DELETED, "info");
      await this.loadPlaylists();
    } catch (e) {
      logger.error(e);
      showToast(MSG.PL_DELETE_FAILED, "error");
    }
  },

  async renamePlaylist(oldName: string, newName: string): Promise<void> {
    if (!oldName || !newName) return;
    const safeOld: string = escapeArg(oldName);
    const safeNew: string = escapeArg(newName);
    try {
      await mpdClient.send(`rename "${safeOld}" "${safeNew}"`);
      showToast(MSG.PL_RENAMED, "success");
      await this.loadPlaylists();
    } catch (e) {
      logger.error(e);
      showToast(MSG.PL_RENAME_FAILED, "error");
    }
  },

  async openPlaylistDetails(playlistName: string): Promise<void> {
    if (!playlistName) return;
    activePlaylistName.set(playlistName);
    activePlaylistTracks.set([]);
    isLoadingTracks.set(true);
    const safeName: string = escapeArg(playlistName);
    try {
      const text: string = await mpdClient.send(`listplaylistinfo "${safeName}"`);
      const rawTracks: Track[] = MpdParser.parseTracks(text);

      const filesToLookup: string[] = rawTracks
        .map((t) => t.file)
        .filter((f) => f && !isRemoteUrl(f));

      let cachedMap = new Map<string, Track>();
      if (filesToLookup.length > 0) {
        try {
          cachedMap = await db.getFilesMap(filesToLookup);
        } catch (dbErr) {
          logger.warn("Failed to hydrate playlist from DB", dbErr);
        }
      }

      const enrichedTracks: Track[] = rawTracks.map((track) => {
        const cached = cachedMap.get(track.file);
        if (cached) {
          return {
            ...track,
            thumbHash: cached.thumbHash,
            qualityBadge: cached.qualityBadge,
            title: track.title || cached.title,
            artist: track.artist || cached.artist,
            album: track.album || cached.album,
            _uid: generateUid(),
          };
        }
        return {
          ...track,
          _uid: generateUid(),
        };
      });

      activePlaylistTracks.set(enrichedTracks);
    } catch (e) {
      logger.error(e);
      showToast(MSG.PL_COULD_NOT_LOAD, "error");
    } finally {
      isLoadingTracks.set(false);
    }
  },

  async addPlaylistToQueue(playlistName: string): Promise<void> {
    if (!playlistName) return;
    const safeName: string = escapeArg(playlistName);
    await mpdClient.send(`load "${safeName}"`);
  },

  async playPlaylist(name: string): Promise<void> {
    if (!name) return;
    const safeName: string = escapeArg(name);
    try {
      await mpdClient.send("stop");
      await mpdClient.send("clear");
      await mpdClient.send(`load "${safeName}"`);
      await mpdClient.send("play 0");
    } catch (e) {
      logger.error(e);
      showToast(MSG.PLAY_FAILED_TO_PLAY, "error");
    }
  },

  async addToPlaylist(track: Track, playlistName: string): Promise<void> {
    // Yandex rows carry no local file path, so there is nothing to add to an MPD playlist.
    if (!track || !track.file) return;
    const safeName: string = escapeArg(playlistName);
    const safeFile: string = escapePath(track.file);
    try {
      await mpdClient.send(`playlistadd "${safeName}" "${safeFile}"`);
      showToast(MSG.addedToPlaylist(playlistName), "success");
    } catch (e) {
      logger.error(e);
      showToast(MSG.PLAY_FAILED_TO_ADD, "error");
    }
  },

  async getPlaylistTracks(name: string): Promise<Track[]> {
    const safeName: string = escapeArg(name);
    const raw: string = await mpdClient.send(`listplaylistinfo "${safeName}"`);
    return MpdParser.parseTracks(raw);
  },

  async movePlaylistTrack(playlistName: string, fromPos: number, toPos: number): Promise<void> {
    const safeName: string = escapeArg(playlistName);
    try {
      await mpdClient.send(`playlistmove "${safeName}" ${fromPos} ${toPos}`);
    } catch (e) {
      showToast(MSG.PLAY_MOVE_FAILED, "error");
    }
  },

  async removeFromPlaylist(playlistName: string, pos: number): Promise<boolean> {
    const safeName: string = escapeArg(playlistName);
    try {
      await mpdClient.send(`playlistdelete "${safeName}" ${pos}`);
      showToast(MSG.TRACK_REMOVED, "success");
      return true;
    } catch (e) {
      showToast(MSG.PL_DELETE_FAILED, "error");
      return false;
    }
  },

  async loadFavorites(): Promise<void> {
    try {
      const text: string = await mpdClient.send(`listplaylistinfo "${FAV_PLAYLIST}"`);
      const tracks: Track[] = MpdParser.parseTracks(text);

      const favSet = new Set<string>();
      tracks.forEach((t) => {
        if (t.file) {
          favSet.add(t.file);
        }
      });

      favorites.set(favSet);
    } catch (e) {
      favorites.set(new Set<string>());
    }
  },

  async toggleFavorite(track: Track): Promise<void> {
    if (!track || !track.file) return;

    const rawFile: string = track.file;
    // track.file is a file/stream path (it can contain backslashes), so it needs
    // escapePath — not escapeArg — exactly like addToPlaylist. escapeArg only
    // escapes quotes and would under-escape a backslash-bearing local path.
    const safeFile: string = escapePath(rawFile);
    const isUrl: boolean = isRemoteUrl(rawFile);

    const currentFavs: Set<string> = get(favorites);
    let isFav: boolean = currentFavs.has(rawFile);

    if (!isFav && isUrl) {
      const targetClean: string = cleanUrl(rawFile);
      for (const f of currentFavs) {
        if (cleanUrl(f) === targetClean) {
          isFav = true;
          break;
        }
      }
    }

    favorites.update((s) => {
      const newSet = new Set<string>(s);
      if (isFav) {
        newSet.delete(rawFile);
        if (isUrl) {
          const t: string = cleanUrl(rawFile);
          for (const f of newSet) if (cleanUrl(f) === t) newSet.delete(f);
        }
      } else {
        newSet.add(rawFile);
      }
      return newSet;
    });

    _favActionQueue = _favActionQueue.then(async () => {
      try {
        const text: string = await mpdClient.send(`listplaylistinfo "${FAV_PLAYLIST}"`);
        const tracks: Track[] = MpdParser.parseTracks(text);

        let matchIndices: number[] = [];

        tracks.forEach((t, i) => {
          let match: boolean = false;
          if (t.file === rawFile) match = true;
          else if (isUrl && cleanUrl(t.file) === cleanUrl(rawFile))
            match = true;
          else if (
            isUrl &&
            (t.file.includes(rawFile) || rawFile.includes(t.file))
          )
            match = true;

          if (match) matchIndices.push(i);
        });

        if (isFav) {
          if (matchIndices.length > 0) {
            matchIndices.sort((a, b) => b - a);
            for (const idx of matchIndices) {
              await mpdClient.send(`playlistdelete "${FAV_PLAYLIST}" ${idx}`);
            }
            showToast(MSG.FAV_REMOVED, "info");
          }
        } else {
          if (matchIndices.length > 0) {
            logger.log("[Fav] Track already exists. Skipping.");
          } else {
            await mpdClient.send(`playlistadd "${FAV_PLAYLIST}" "${safeFile}"`);
            if (tracks.length > 0) {
              await mpdClient.send(
                `playlistmove "${FAV_PLAYLIST}" ${tracks.length} 0`,
              );
            }
            showToast(MSG.FAV_ADDED, "success");
          }
        }
      } catch (e) {
        logger.error("Fav action failed", e);
        showToast(MSG.FAV_ACTION_FAILED, "error");
      } finally {
        await LibraryActions.loadFavorites();
      }
    }).catch((e) => {
      logger.error("[Fav] Queue error:", e);
    });
  },
};
