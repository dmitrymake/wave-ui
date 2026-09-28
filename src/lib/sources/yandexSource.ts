// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { get, derived } from "svelte/store";
import { PlayerActions } from "../playback/player";
import {
  status,
  currentSong,
  queue,
  showToast,
  activeMenuTab,
  resetNavigation,
  navigateTo,
} from "../store";
import { yandexContext, yandexFavorites, yandexState } from "../stores/yandex";
import { YandexApi, YANDEX_ENDPOINT } from "../yandex";
import { YandexService } from "../yandexService";
import { getYandexIdFromUrl } from "./yandexUri";
import { fetchWithTimeout } from "../http";
import { ICONS } from "../icons";
import { MSG } from "../messages";
import { logger } from "../logger";
import { registerTrackSource, type TrackSource, type SourceRoute } from "./trackSource";
import { trimStreamCache, lookupStreamCache } from "./streamCache";
import { normalizeStreamMeta, isRecord } from "../validate";
import type { Track, MpdStatus, CurrentSong } from "../types";
import type { YandexContext, YandexTrack } from "../types/yandex";

export const YANDEX_SOURCE_ID = "yandex";

// Bridge a Yandex source-list row to a full Track for TrackRow. YandexTrack omits
// the local-library fields (file/genre/track), so they get neutral defaults — the
// owning source is identified by the `service` tag the caller passes, not the
// file (file stays "" so the now-playing/highlight logic behaves as before, i.e.
// no file-id match for list rows). Replaces the prior `as unknown as Track` cast.
export function yandexTrackToTrack(item: YandexTrack, service: string): Track {
  return {
    file: "",
    title: item.title,
    artist: item.artist,
    album: item.album ?? "",
    genre: "",
    time: item.time ?? 0,
    track: "",
    id: String(item.id),
    image: item.image,
    service,
  };
}

async function getYandexMeta(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchWithTimeout(
      YANDEX_ENDPOINT.URL + "?action=get_meta&url=" + encodeURIComponent(url),
    );
    if (res.ok) {
      const data: unknown = await res.json();
      if (isRecord(data)) return data;
      logger.warn("[Yandex] Invalid meta shape for", url);
    }
  } catch (e) {
    logger.warn("[Yandex] Failed to fetch meta:", e);
  }
  return null;
}

async function batchGetYandexMeta(
  urls: string[],
): Promise<Record<string, Record<string, unknown> | null>> {
  if (!urls.length) return {};
  try {
    const res = await fetchWithTimeout(YANDEX_ENDPOINT.URL + "?action=batch_get_meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    if (res.ok) {
      const data: unknown = await res.json();
      if (isRecord(data)) return data as Record<string, Record<string, unknown> | null>;
      logger.warn("[Yandex] Invalid batch meta shape");
    }
  } catch (e) {
    logger.warn("[Yandex] Failed to batch-fetch meta:", e);
  }
  return {};
}

// Build the cache entry from raw Yandex meta with runtime validation. Invalid
// rows (wrong types, empty title+artist) return null and are skipped instead of
// poisoning the queue — the caller logs once and degrades.
function buildYandexCacheEntry(url: string, meta: Record<string, unknown>) {
  const norm = normalizeStreamMeta(url, meta);
  if (!norm) return null;
  return {
    id: norm.id,
    title: norm.title,
    artist: norm.artist,
    album: norm.album,
    image: norm.image,
    time: norm.time,
    isYandex: true as const,
    file: url,
  };
}

// Shape of a Yandex stream-cache entry as produced by buildYandexCacheEntry.
type YandexCacheEntry = NonNullable<ReturnType<typeof buildYandexCacheEntry>>;

// Store the entry in the stream cache under both its url and (if present) its id.
function cacheYandexMeta(
  url: string,
  meta: Record<string, unknown>,
  cacheEntry: YandexCacheEntry,
): void {
  yandexContext.update((ctx) => {
    const newCache = { ...ctx.streamCache };
    newCache[url] = cacheEntry;
    if (meta.id) newCache[String(meta.id)] = cacheEntry;
    return { ...ctx, streamCache: trimStreamCache(newCache) };
  });
}

// Patch any queue rows matching `url` with the cached Yandex meta. `withId`
// controls whether the row's id is overwritten: the batch path set it
// (`id: cacheEntry.id || t.id`); the single-track path did not.
function applyYandexMetaToQueue(
  url: string,
  cacheEntry: YandexCacheEntry,
  withId: boolean,
): void {
  queue.update((q) =>
    q.map((t) => {
      if (t.file !== url) return t;
      const patched = {
        ...t,
        title: cacheEntry.title || t.title,
        artist: cacheEntry.artist || t.artist,
        album: cacheEntry.album || t.album,
        image: cacheEntry.image,
        service: YANDEX_SOURCE_ID,
        time: cacheEntry.time || t.time,
      };
      return withId ? { ...patched, id: cacheEntry.id || t.id } : patched;
    }),
  );
}

async function fetchMetaBatch(urls: string[]): Promise<void> {
  const yCtx: YandexContext = get(yandexContext);
  const missing = urls.filter((u) => {
    if (lookupStreamCache(yCtx.streamCache, u, getYandexIdFromUrl)) return false;
    return true;
  });
  if (!missing.length) return;

  const results = await batchGetYandexMeta(missing);
  for (const url of Object.keys(results)) {
    const meta = results[url];
    if (!meta) continue;
    const cacheEntry = buildYandexCacheEntry(url, meta);
    if (!cacheEntry) {
      logger.warn("[Yandex] Skipping invalid meta for", url);
      continue;
    }
    cacheYandexMeta(url, meta, cacheEntry);
    applyYandexMetaToQueue(url, cacheEntry, true);
  }

  const song: CurrentSong = get(currentSong);
  if (song.file && results[song.file]) {
    const norm = normalizeStreamMeta(song.file, results[song.file]);
    if (norm) {
      currentSong.update((s) => ({
        ...s,
        // Truthy fallback so an empty Yandex title does not blank the display.
        title: norm.title || s.title,
        artist: norm.artist || s.artist,
        album: norm.album ?? s.album,
        image: norm.image,
        service: YANDEX_SOURCE_ID,
      }));
      status.update((s) => {
        if (norm.time && (s.duration === 0 || isNaN(s.duration))) {
          return { ...s, duration: norm.time };
        }
        return s;
      });
    }
  }
}

async function fetchMetaForTrack(url: string): Promise<void> {
  const yCtx: YandexContext = get(yandexContext);
  if (lookupStreamCache(yCtx.streamCache, url, getYandexIdFromUrl)) return;

  const meta = await getYandexMeta(url);
  if (meta) {
    const cacheEntry = buildYandexCacheEntry(url, meta);
    if (!cacheEntry) {
      logger.warn("[Yandex] Skipping invalid meta for", url);
      return;
    }
    cacheYandexMeta(url, meta, cacheEntry);

    const song: CurrentSong = get(currentSong);
    if (song.file === url) {
      currentSong.update((s) => ({
        ...s,
        title: cacheEntry.title,
        artist: cacheEntry.artist,
        album: cacheEntry.album || s.album,
        image: cacheEntry.image,
        service: YANDEX_SOURCE_ID,
      }));

      status.update((s) => {
        if (cacheEntry.time && (s.duration === 0 || isNaN(s.duration))) {
          return { ...s, duration: cacheEntry.time };
        }
        return s;
      });
    }

    applyYandexMetaToQueue(url, cacheEntry, false);
  }
}

// The track is appended server-side (the PHP daemon adds it to MPD), so we cannot
// capture its id from `addid` the way the generic player does. Instead: confirm the
// queue actually grew, then resolve the appended track's STABLE MPD Id from its
// position. Callers then move/play by id (moveid/playid), which is immune to the
// index shifts that made the old `move playlistlength-1` target the wrong track.
async function appendYandexTrack(id: string): Promise<number> {
  const lenBefore: number = await PlayerActions.getQueueLength();
  await YandexApi.request("play_track", { id, append: 1 });
  const lenAfter: number = await PlayerActions.getQueueLength();

  const before: number = isNaN(lenBefore) ? 0 : lenBefore;
  if (isNaN(lenAfter) || lenAfter <= before) return NaN;

  return await PlayerActions.getQueueItemIdAt(lenAfter - 1);
}

// Hash routes Yandex owns, declaring how each path round-trips to a navigation
// view+data. The exact parse fallbacks (required part counts) and serialize paths
// mirror what the router previously hard-coded, so behaviour is byte-for-byte
// preserved while the knowledge now lives with the source. `menuTab: "yandex"`
// activates the Yandex tab on parse and marks "yandex" as this source's tab root.
const YANDEX_MENU_TAB = "yandex";

const yandexRoutes: SourceRoute[] = [
  {
    routePrefix: "yandex_search",
    viewName: "yandex_search",
    menuTab: YANDEX_MENU_TAB,
    allowEmptyData: true,
    parseParams(parts) {
      // parts are AFTER the prefix, so the query is parts[0]
      // (old guard: route === "yandex_search" && parts.length >= 2).
      if (parts.length >= 1) return { query: parts[0] };
      return null;
    },
    buildPath(data) {
      if (data?.query) {
        return `yandex_search/${encodeURIComponent(data.query as string)}`;
      }
      return null;
    },
  },
  {
    routePrefix: "yandex_artist",
    viewName: "yandex_artist_details",
    menuTab: YANDEX_MENU_TAB,
    parseParams(parts) {
      // Require a non-empty id: `#/yandex_artist/` (trailing slash) must be a
      // safe no-op, not a details view that fetches `.../undefined`.
      if (parts.length >= 1 && parts[0]) return { id: parts[0], title: "Artist" };
      return null;
    },
    buildPath(data) {
      if (data?.id) return `yandex_artist/${data.id}`;
      return null;
    },
  },
  {
    routePrefix: "yandex_album",
    viewName: "yandex_album_details",
    menuTab: YANDEX_MENU_TAB,
    parseParams(parts) {
      if (parts.length >= 1 && parts[0]) return { id: parts[0], title: "Album" };
      return null;
    },
    buildPath(data) {
      if (data?.id) return `yandex_album/${data.id}`;
      return null;
    },
  },
  {
    routePrefix: "yandex_playlist",
    viewName: "yandex_playlist",
    menuTab: YANDEX_MENU_TAB,
    parseParams(parts) {
      // old guard: route === "yandex_playlist" && parts.length >= 3 (uid + kind)
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return { uid: parts[0], kind: parts[1], title: "Playlist" };
      }
      return null;
    },
    buildPath(data) {
      if (data?.uid && data?.kind) {
        return `yandex_playlist/${data.uid}/${data.kind}`;
      }
      return null;
    },
  },
];

export const yandexSource: TrackSource = {
  id: YANDEX_SOURCE_ID,

  routes: yandexRoutes,

  // Yandex streams expose a real elapsed/duration even though their file is a
  // remote/RAM-cache url, so the player keeps the elapsed timer ticking for them.
  streamsHaveElapsed: true,

  // Brand glyph rendered next to Yandex tracks in generic track rows.
  brandIcon: ICONS.YANDEX,

  matches(file: string): boolean {
    return (
      file.includes("yandex.net") ||
      file.includes("get-mp3") ||
      file.startsWith("yandex:") ||
      file.includes("storage.yandex.net") ||
      file.includes("/dev/shm/yandex_music/tracks/")
    );
  },

  enrichQueueTrack(t: Track, toFetch: string[]): Track | null {
    const fileUrl: string = t.file || "";
    const yCtx: YandexContext = get(yandexContext);

    const yMeta = lookupStreamCache(yCtx.streamCache, fileUrl, getYandexIdFromUrl);

    if (yMeta) {
      const metaTime: number = parseFloat(String(yMeta.time || 0));
      const currentT: number = parseFloat(String(t.time || 0));

      return {
        ...t,
        title: yMeta.title || t.title,
        artist: yMeta.artist || t.artist,
        album: yMeta.album || t.album,
        image: yMeta.image,
        service: YANDEX_SOURCE_ID,
        id: String(yMeta.id),
        time: currentT > 0 ? currentT : metaTime,
        _uid: String(t.id ?? t.pos) + "y",
      };
    }

    toFetch.push(fileUrl);
    return null;
  },

  fetchQueueMeta(urls: string[]): void {
    if (urls.length === 1) fetchMetaForTrack(urls[0]);
    else if (urls.length > 1) fetchMetaBatch(urls);
  },

  enrichCurrentSong(serverSong: CurrentSong, serverStatus: MpdStatus): void {
    if (!serverSong.file) return;

    const yCtx: YandexContext = get(yandexContext);
    const yMeta = lookupStreamCache(yCtx.streamCache, serverSong.file, getYandexIdFromUrl);

    if (yMeta) {
      serverSong.title = yMeta.title;
      serverSong.artist = yMeta.artist;
      serverSong.album = yMeta.album || serverSong.album;
      serverSong.image = yMeta.image;
      serverSong.service = YANDEX_SOURCE_ID;
      serverSong.id = String(yMeta.id);
      if (serverStatus.duration === 0 || isNaN(serverStatus.duration)) {
        if (yMeta.time) serverStatus.duration = parseFloat(String(yMeta.time));
      }
    } else if (this.matches(serverSong.file)) {
      fetchMetaForTrack(serverSong.file);
    }
  },

  async playUri(uri: string, currentPos: number): Promise<boolean> {
    if (!uri.startsWith("yandex:")) return false;
    const id: string = uri.split(":")[1];

    const newId: number = await appendYandexTrack(id);
    // The daemon failed to append the track (queue did not grow), so there is
    // nothing to move/play. The URI is still "handled" by this source (return true,
    // so dispatch does not fall through to other sources), but previously the
    // failure was swallowed silently and left the UI stuck on "Loading…" — surface
    // a toast so the user actually sees that playback did not start.
    if (isNaN(newId)) {
      showToast(MSG.PLAY_FAILED_TO_PLAY, "error");
      return true;
    }

    // Move/play BY ID (moveid/playid). The old code moved playlistlength-1 read from
    // a separate status, so a concurrent queue change made len-1 the wrong track.
    const targetPos: number = isNaN(currentPos) ? 0 : currentPos + 1;
    await PlayerActions.moveById(newId, targetPos);
    await PlayerActions.playById(newId);
    return true;
  },

  async addToQueue(uri: string): Promise<boolean> {
    if (!uri.startsWith("yandex:")) return false;
    const id: string = uri.split(":")[1];
    await YandexApi.request("add_tracks", { tracks: [{ id }] }, "POST");
    showToast(MSG.PLAY_ADDED_TO_QUEUE, "success");
    return true;
  },

  async playNext(uri: string, currentPos: number): Promise<boolean> {
    if (!uri.startsWith("yandex:")) return false;
    const id: string = uri.split(":")[1];

    const newId: number = await appendYandexTrack(id);
    if (isNaN(newId)) return true;

    await PlayerActions.moveById(newId, currentPos + 1);
    showToast(MSG.PLAY_WILL_PLAY_NEXT, "success");
    return true;
  },

  onSkip(track: Track | CurrentSong, elapsed: number): void {
    if (track.id) {
      YandexApi.feedbackSkip(track.id, elapsed).catch(() => {});
    }
  },

  isLiked(track: Track): boolean {
    return get(yandexFavorites).has(String(track.id));
  },

  async toggleLike(track: Track): Promise<void> {
    const id = String(track.id);
    const liked = get(yandexFavorites).has(id);
    try {
      // Immutable flip: Svelte notifies only on reference change, so copy the
      // Set instead of mutating in place (old code returned the same ref).
      yandexFavorites.update((s) => {
        const next = new Set(s);
        if (liked) next.delete(id);
        else next.add(id);
        return next;
      });
      showToast(
        liked ? MSG.FAV_REMOVED_YANDEX : MSG.FAV_ADDED_YANDEX,
        liked ? "info" : "success",
      );
      await YandexApi.toggleLike(track.id, liked);
    } catch (err) {
      yandexFavorites.update((s) => {
        const next = new Set(s);
        if (liked) next.add(id);
        else next.delete(id);
        return next;
      });
      showToast(MSG.FAV_ERROR_UPDATING, "error");
    }
  },

  matchesPlaying(track: Track, currentFile: string | null | undefined): boolean {
    // Yandex tracks carry the same numeric id on both sides, but expressed
    // differently: source lists use `yandex:<id>` while the playing MPD file is a
    // RAM cache path / CDN url. Compare by extracted id so the now-playing
    // highlight works in album/playlist/search views too, not just the queue.
    const playingId: string | null = getYandexIdFromUrl(currentFile);
    return playingId !== null && getYandexIdFromUrl(track.file) === playingId;
  },

  navigateToArtist(track: Track): void {
    if (!track.artist) return;
    // Canonical navigation (no direct history.*): the hash follows via the
    // Router.updateUrl callback, so stack and URL cannot diverge.
    activeMenuTab.set(YANDEX_MENU_TAB);
    resetNavigation();
    navigateTo("yandex_search", { query: track.artist });
  },

  isQueueNavigable(): boolean {
    // Yandex streams behave like queue tracks (next/prev advance the MPD queue),
    // unlike internet-radio stations which cycle through the station list.
    return true;
  },

  async startRadioByTrack(track: Track): Promise<void> {
    if (!track.id) return;
    showToast(MSG.startingRadio(track.title), "info");
    try {
      await YandexApi.playRadio(track.id, "track");
    } catch (e) {
      logger.error(e);
      showToast(MSG.RADIO_ERROR_STARTING, "error");
    }
  },

  async startRadioByArtist(track: Track): Promise<void> {
    if (!track.artist) return;
    showToast(MSG.searchingArtist(track.artist), "info");
    try {
      const searchRes = await YandexApi.search(track.artist);
      if (searchRes && searchRes.artists && searchRes.artists.length > 0) {
        const artistId = searchRes.artists[0].id;
        showToast(MSG.startingVibeFor(searchRes.artists[0].title), "info");
        await YandexApi.playRadio(artistId, "artist");
      } else {
        showToast(MSG.RADIO_ARTIST_NOT_FOUND, "error");
      }
    } catch (e) {
      showToast(MSG.RADIO_FAILED_ARTIST_VIBE, "error");
    }
  },

  // Background daemon banner: the PHP daemon keeps a vibe/queue alive server-side.
  // The banner reflects yandexState and lets the UI poll for / stop the daemon.
  daemon: {
    state: derived(yandexState, ($s) => ({
      active: $s.active,
      label: $s.context_name || "Yandex Stream",
    })),

    startPolling(): () => void {
      YandexService.refreshYandexDaemonState();
      const interval = setInterval(() => {
        YandexService.refreshYandexDaemonState();
      }, 5000);
      return () => clearInterval(interval);
    },

    async stop(): Promise<void> {
      await YandexService.stopYandexDaemon();
    },
  },
};

registerTrackSource(yandexSource);
