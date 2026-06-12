// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { get } from "svelte/store";
import { mpdClient } from "../mpd/client";
import { MpdParser } from "../mpd/parser";
import {
  status,
  currentSong,
  queue,
  yandexContext,
  showToast,
} from "../store";
import { YandexApi } from "../yandex";
import { getYandexIdFromUrl } from "./yandexUri";
import { API_ENDPOINTS } from "../constants";
import { MSG } from "../messages";
import { logger } from "../logger";
import { registerTrackSource, type TrackSource } from "./trackSource";
import type { Track, MpdStatus, CurrentSong, YandexContext, YandexTrack } from "../types";

const STREAM_CACHE_MAX = 300;
const STREAM_CACHE_TRIM_TO = 200;

function trimStreamCache(
  cache: Record<string, YandexTrack & { file: string }>,
): Record<string, YandexTrack & { file: string }> {
  const keys = Object.keys(cache);
  if (keys.length <= STREAM_CACHE_MAX) return cache;
  const trimmed: Record<string, YandexTrack & { file: string }> = {};
  const keep = keys.slice(-STREAM_CACHE_TRIM_TO);
  for (const k of keep) {
    trimmed[k] = cache[k];
  }
  return trimmed;
}

async function getYandexMeta(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      API_ENDPOINTS.YANDEX + "?action=get_meta&url=" + encodeURIComponent(url),
    );
    if (res.ok) return await res.json();
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
    const res = await fetch(API_ENDPOINTS.YANDEX + "?action=batch_get_meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    logger.warn("[Yandex] Failed to batch-fetch meta:", e);
  }
  return {};
}

async function fetchMetaBatch(urls: string[]): Promise<void> {
  const yCtx: YandexContext = get(yandexContext);
  const missing = urls.filter((u) => {
    if (yCtx.streamCache && yCtx.streamCache[u]) return false;
    const tId = getYandexIdFromUrl(u);
    if (tId && yCtx.streamCache && yCtx.streamCache[tId]) return false;
    return true;
  });
  if (!missing.length) return;

  const results = await batchGetYandexMeta(missing);
  for (const url of Object.keys(results)) {
    const meta = results[url];
    if (!meta) continue;
    const cacheEntry = {
      id: String(meta.id ?? ""),
      title: String(meta.title ?? ""),
      artist: String(meta.artist ?? ""),
      album: meta.album as string | undefined,
      image: meta.image as string | undefined,
      time: meta.time as number | undefined,
      isYandex: true as const,
      file: url,
    };
    yandexContext.update((ctx) => {
      const newCache = { ...ctx.streamCache };
      newCache[url] = cacheEntry;
      if (meta.id) newCache[String(meta.id)] = cacheEntry;
      return { ...ctx, streamCache: trimStreamCache(newCache) };
    });
    queue.update((q) =>
      q.map((t) => {
        if (t.file !== url) return t;
        return {
          ...t,
          title: cacheEntry.title || t.title,
          artist: cacheEntry.artist || t.artist,
          album: cacheEntry.album || t.album,
          image: cacheEntry.image,
          isYandex: true,
          time: cacheEntry.time || t.time,
          id: cacheEntry.id || t.id,
        };
      }),
    );
  }

  const song: CurrentSong = get(currentSong);
  if (song.file && results[song.file]) {
    const m = results[song.file];
    if (m) {
      currentSong.update((s) => ({
        ...s,
        // Truthy fallback so an empty Yandex title does not blank the display.
        title: String(m.title || s.title),
        artist: String(m.artist || s.artist),
        album: (m.album as string | undefined) ?? s.album,
        image: m.image as string | undefined,
        isYandex: true,
      }));
      status.update((s) => {
        const t = m.time as number | undefined;
        if (t && (s.duration === 0 || isNaN(s.duration))) {
          return { ...s, duration: t };
        }
        return s;
      });
    }
  }
}

async function fetchMetaForTrack(url: string): Promise<void> {
  const yCtx: YandexContext = get(yandexContext);
  if (yCtx.streamCache && yCtx.streamCache[url]) return;

  const tId: string | null = getYandexIdFromUrl(url);
  if (tId && yCtx.streamCache && yCtx.streamCache[tId]) return;

  const meta = await getYandexMeta(url);
  if (meta) {
    const cacheEntry = {
      id: String(meta.id ?? ""),
      title: String(meta.title ?? ""),
      artist: String(meta.artist ?? ""),
      album: meta.album as string | undefined,
      image: meta.image as string | undefined,
      time: meta.time as number | undefined,
      isYandex: true as const,
      file: url,
    };
    yandexContext.update((ctx) => {
      const newCache = { ...ctx.streamCache };
      newCache[url] = cacheEntry;
      if (meta.id) {
        newCache[String(meta.id)] = cacheEntry;
      }
      return { ...ctx, streamCache: trimStreamCache(newCache) };
    });

    const song: CurrentSong = get(currentSong);
    if (song.file === url) {
      currentSong.update((s) => ({
        ...s,
        title: cacheEntry.title,
        artist: cacheEntry.artist,
        album: cacheEntry.album || s.album,
        image: cacheEntry.image,
        isYandex: true,
      }));

      status.update((s) => {
        if (cacheEntry.time && (s.duration === 0 || isNaN(s.duration))) {
          return { ...s, duration: cacheEntry.time };
        }
        return s;
      });
    }

    queue.update((q) =>
      q.map((t) => {
        if (t.file === url)
          return {
            ...t,
            title: cacheEntry.title || t.title,
            artist: cacheEntry.artist || t.artist,
            album: cacheEntry.album || t.album,
            image: cacheEntry.image,
            isYandex: true,
            time: cacheEntry.time || t.time,
          };
        return t;
      }),
    );
  }
}

export const yandexSource: TrackSource = {
  id: "yandex",

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

    if (yCtx.streamCache) {
      let yMeta = yCtx.streamCache[fileUrl];
      if (!yMeta) {
        const tId: string | null = getYandexIdFromUrl(fileUrl);
        if (tId) yMeta = yCtx.streamCache[String(tId)];
      }

      if (yMeta) {
        const metaTime: number = parseFloat(String(yMeta.time || 0));
        const currentT: number = parseFloat(String(t.time || 0));

        return {
          ...t,
          title: yMeta.title || t.title,
          artist: yMeta.artist || t.artist,
          album: yMeta.album || t.album,
          image: yMeta.image,
          isYandex: true as const,
          id: String(yMeta.id),
          time: currentT > 0 ? currentT : metaTime,
          mpdId: t.id,
          mpdPos: t.pos as string,
          _uid: String(t.id ?? t.pos) + "y",
        };
      }
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
    let yMeta: (YandexTrack & { file: string }) | undefined;
    if (yCtx.streamCache) {
      yMeta = yCtx.streamCache[serverSong.file];
      if (!yMeta) {
        const tId = getYandexIdFromUrl(serverSong.file);
        if (tId) yMeta = yCtx.streamCache[String(tId)];
      }
    }

    if (yMeta) {
      serverSong.title = yMeta.title;
      serverSong.artist = yMeta.artist;
      serverSong.album = yMeta.album || serverSong.album;
      serverSong.image = yMeta.image;
      serverSong.isYandex = true;
      serverSong.id = String(yMeta.id);
      if (serverStatus.duration === 0 || isNaN(serverStatus.duration)) {
        if (yMeta.time) serverStatus.duration = parseFloat(String(yMeta.time));
      }
    } else if (
      serverSong.file.includes("yandex.net") ||
      serverSong.file.includes("get-mp3") ||
      serverSong.file.includes("/dev/shm/yandex_music/tracks/")
    ) {
      fetchMetaForTrack(serverSong.file);
    }
  },

  async playUri(uri: string, currentPos: number): Promise<boolean> {
    if (!uri.startsWith("yandex:")) return false;
    const id: string = uri.split(":")[1];
    await YandexApi.request("play_track", { id, append: 1 });

    const statusRes: string = await mpdClient.send("status");
    const len: number = parseInt(MpdParser.parseKeyValue(statusRes).playlistlength);
    const targetPos: number = isNaN(currentPos) ? 0 : currentPos + 1;

    if (len > 0) {
      await mpdClient.send(`move ${len - 1} ${targetPos}`);
      await mpdClient.send(`play ${targetPos}`);
    }
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
    await YandexApi.request("play_track", { id, append: 1 });

    const statusRes: string = await mpdClient.send("status");
    const len: number = parseInt(MpdParser.parseKeyValue(statusRes).playlistlength);

    if (len > 0) {
      await mpdClient.send(`move ${len - 1} ${currentPos + 1}`);
      showToast(MSG.PLAY_WILL_PLAY_NEXT, "success");
    }
    return true;
  },

  onSkip(track: Track | CurrentSong, elapsed: number): void {
    if (track.isYandex && track.id) {
      YandexApi.feedbackSkip(track.id, elapsed).catch(() => {});
    }
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
      const searchRes = (await YandexApi.search(track.artist)) as {
        artists?: { id: string; title: string }[];
      };
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
};

registerTrackSource(yandexSource);
