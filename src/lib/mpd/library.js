import { get } from "svelte/store";
import { mpdClient } from "./client";
import { MpdParser } from "./parser";
import { CONFIG } from "../../config";
import {
  isSyncingLibrary,
  isLoadingPlaylists,
  playlists,
  isLoadingTracks,
  activePlaylistTracks,
  showToast,
  favorites,
} from "../store";
import { db } from "../db";
import SyncWorker from "../workers/sync.worker.js?worker";
import { generateUid } from "../utils";

const FAV_PLAYLIST = "Favorites";

let _favActionQueue = Promise.resolve();

const normFile = (path) => {
  if (!path) return "";
  try {
    let p = decodeURIComponent(path).normalize("NFC");
    if (p.startsWith("/")) p = p.slice(1);
    return p.trim().toLowerCase();
  } catch (e) {
    return String(path).toLowerCase();
  }
};

const cleanUrl = (url) => {
  if (!url) return "";
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("?")[0]
    .replace(/\/$/, "");
};

function getGradient(name) {
  if (name === "Favorites") {
    return `linear-gradient(135deg, hsl(348, 95%, 58%), hsl(348, 90%, 40%))`;
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `linear-gradient(135deg, hsl(${hue}, 60%, 40%), hsl(${(hue + 40) % 360}, 60%, 30%))`;
}

export const LibraryActions = {
  async syncLibrary() {
    if (get(isSyncingLibrary)) return;
    isSyncingLibrary.set(true);

    const worker = new SyncWorker();
    worker.postMessage({
      type: "START_SYNC",
      payload: { url: `http://${CONFIG.MOODE_IP}/wave-api.php` },
    });

    worker.onmessage = (e) => {
      const { type, count } = e.data;
      if (type === "DONE") {
        showToast(`Library updated: ${count} tracks`, "success");
        isSyncingLibrary.set(false);
        worker.terminate();
      }
      if (type === "ERROR") {
        showToast("Sync Failed", "error");
        isSyncingLibrary.set(false);
        worker.terminate();
      }
    };
    worker.onerror = () => {
      isSyncingLibrary.set(false);
      worker.terminate();
    };
  },

  async loadPlaylists() {
    isLoadingPlaylists.set(true);
    try {
      const text = await mpdClient.send("listplaylists");
      const rawPlaylists = MpdParser.parsePlaylists(text);

      const enhanced = rawPlaylists.map((pl) => ({
        ...pl,
        color: getGradient(pl.name),
      }));

      playlists.set(enhanced);
    } catch (e) {
      console.error(e);
    } finally {
      isLoadingPlaylists.set(false);
    }
  },

  async openPlaylistDetails(playlistName) {
    if (!playlistName) return;
    isLoadingTracks.set(true);
    const safeName = playlistName.replace(/"/g, '\\"');
    try {
      const text = await mpdClient.send(`listplaylistinfo "${safeName}"`);
      const rawTracks = MpdParser.parseTracks(text);

      // Собираем пути файлов, чтобы найти их в DB
      const filesToLookup = rawTracks
        .map((t) => t.file)
        .filter((f) => f && !f.startsWith("http"));

      let cachedMap = new Map();
      if (filesToLookup.length > 0) {
        try {
          cachedMap = await db.getFilesMap(filesToLookup);
        } catch (dbErr) {
          console.warn("Failed to hydrate playlist from DB", dbErr);
        }
      }

      const enrichedTracks = rawTracks.map((track) => {
        const cached = cachedMap.get(track.file);
        if (cached) {
          return {
            ...track,
            // Дополняем данными из базы
            thumbHash: cached.thumbHash,
            qualityBadge: cached.qualityBadge,
            // Если в MPD нет title/artist, берем из базы (fallback)
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
      // --- HYDRATION END ---

      activePlaylistTracks.set(enrichedTracks);
    } catch (e) {
      console.error(e);
      showToast("Could not load playlist", "error");
    } finally {
      isLoadingTracks.set(false);
    }
  },

  async movePlaylistTrack(playlistName, fromPos, toPos) {
    const safeName = playlistName.replace(/"/g, '\\"');
    try {
      await mpdClient.send(`playlistmove "${safeName}" ${fromPos} ${toPos}`);
    } catch (e) {
      showToast("Move failed", "error");
    }
  },

  async removeFromPlaylist(playlistName, pos) {
    const safeName = playlistName.replace(/"/g, '\\"');
    try {
      await mpdClient.send(`playlistdelete "${safeName}" ${pos}`);
      showToast("Track removed", "success");
    } catch (e) {
      showToast("Delete failed", "error");
    }
  },

  async loadFavorites() {
    try {
      const text = await mpdClient.send(`listplaylistinfo "${FAV_PLAYLIST}"`);
      const tracks = MpdParser.parseTracks(text);

      const favSet = new Set();
      tracks.forEach((t) => {
        if (t.file) {
          favSet.add(t.file);
        }
      });

      favorites.set(favSet);
    } catch (e) {
      favorites.set(new Set());
    }
  },

  async toggleFavorite(track) {
    if (!track || !track.file) return;

    const rawFile = track.file;
    const safeFile = rawFile.replace(/"/g, '\\"');
    const isUrl = rawFile.startsWith("http");

    const currentFavs = get(favorites);
    let isFav = currentFavs.has(rawFile);

    if (!isFav && isUrl) {
      const targetClean = cleanUrl(rawFile);
      for (const f of currentFavs) {
        if (cleanUrl(f) === targetClean) {
          isFav = true;
          break;
        }
      }
    }

    favorites.update((s) => {
      const newSet = new Set(s);
      if (isFav) {
        newSet.delete(rawFile);
        if (isUrl) {
          const t = cleanUrl(rawFile);
          for (const f of newSet) if (cleanUrl(f) === t) newSet.delete(f);
        }
      } else {
        newSet.add(rawFile);
      }
      return newSet;
    });

    _favActionQueue = _favActionQueue.then(async () => {
      try {
        const text = await mpdClient.send(`listplaylistinfo "${FAV_PLAYLIST}"`);
        const tracks = MpdParser.parseTracks(text);

        let matchIndices = [];

        tracks.forEach((t, i) => {
          let match = false;
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
            showToast("Removed from Favorites", "info");
          }
        } else {
          if (matchIndices.length > 0) {
            console.log("[Fav] Track already exists. Skipping.");
          } else {
            await mpdClient.send(`playlistadd "${FAV_PLAYLIST}" "${safeFile}"`);
            if (tracks.length > 0) {
              await mpdClient.send(
                `playlistmove "${FAV_PLAYLIST}" ${tracks.length} 0`,
              );
            }
            showToast("Added to Favorites", "success");
          }
        }
      } catch (e) {
        console.error("Fav action failed", e);
        showToast("Action failed", "error");
      } finally {
        await this.loadFavorites();
      }
    });
  },
};
