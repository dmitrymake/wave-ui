// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { get } from "svelte/store";
import { registerTrackSource, type TrackSource, type SourceRoute } from "./trackSource";
import { getYoutubeIdFromUrl, isYoutubeVideoId, youtubeStreamUrl } from "./youtubeUri";
import { YoutubeApi, normalizeYoutubeTrack, isYoutubeAuthError } from "../youtube";
import { YoutubeService, rememberYoutubeTracks } from "../youtubeService";
import { youtubeMeta, youtubeFavorites, youtubeStatus } from "../stores/youtube";
import { currentSong, queue, status, activePlaylistTracks, activeMenuTab, navigateTo, resetNavigation, showToast, showModal } from "../store";
import { mpdClient } from "../mpd/client";
import { MpdParser } from "../mpd/parser";
import { ICONS } from "../icons";
import { logger } from "../logger";
import type { Track, MpdStatus } from "../types";
import type { YoutubeTrack, YoutubeSearchFilter } from "../types/youtube";
import { METADATA_FAILURE_COOLDOWN, metadataRetryAllowed, retryMetadataRequest } from "./metadataRequest";

export const YOUTUBE_SEARCH_FILTERS: YoutubeSearchFilter[] = ["songs", "albums", "artists", "playlists", "videos"];
export function youtubeSearchFilter(value: unknown): YoutubeSearchFilter {
  return YOUTUBE_SEARCH_FILTERS.includes(value as YoutubeSearchFilter) ? value as YoutubeSearchFilter : "songs";
}

export const youtubeRoutes: SourceRoute[] = [
  {
    routePrefix: "youtube_search", viewName: "youtube_search", menuTab: "youtube", allowEmptyData: true,
    parseParams: (parts) => ({ query: parts[0] ?? "", filter: youtubeSearchFilter(parts[1]) }),
    buildPath: (data) => data?.query ? `youtube_search/${encodeURIComponent(String(data.query))}/${youtubeSearchFilter(data.filter)}` : null,
  },
  ...["album", "artist", "playlist", "radio"].map((kind): SourceRoute => ({
    routePrefix: `youtube_${kind}`,
    viewName: kind === "album" || kind === "artist" ? `youtube_${kind}_details` : `youtube_${kind}`,
    menuTab: "youtube",
    parseParams: (parts) => parts[0] && /^[A-Za-z0-9_-]{1,160}$/.test(parts[0]) ? { id: parts[0] } : null,
    buildPath: (data) => data?.id ? `youtube_${kind}/${encodeURIComponent(String(data.id))}` : null,
  })),
];

const pendingMeta = new Map<string, Promise<void>>();
const failedMeta = new Map<string, number>();
const preparingAudio = new Map<string, Promise<unknown>>();

function metadataFallback(row: Track): Track {
  return { ...row, title: row.title || row.file.split("/").pop() || row.file,
    artist: row.artist || "Unknown Artist", isMetadataPending: false };
}

function patchMetadata(ids: string[]): void {
  const requested = new Set(ids);
  const cache = get(youtubeMeta);
  const patchRow = (row: Track): Track => {
    const id = getYoutubeIdFromUrl(row.file);
    if (!id || !requested.has(id)) return row;
    if (cache[id]) return enrich(row, cache[id]);
    return row.isMetadataPending ? metadataFallback(row) : row;
  };
  queue.update((rows) => rows.map(patchRow));
  try {
    activePlaylistTracks?.update?.((rows: Track[]) => rows.map(patchRow));
  } catch {
    // store barrel unavailable in unit tests — queue patch above is enough.
  }
  currentSong.update((song) => {
    const id = getYoutubeIdFromUrl(song.file);
    if (id && requested.has(id) && cache[id]) {
      status.update((s) => ({ ...s, duration: s.duration || cache[id].time }));
    }
    return patchRow(song);
  });
}

async function loadMissingMetadata(ids: string[]): Promise<void> {
  try {
    for (let offset = 0; offset < ids.length; offset += 6) {
      let missing = ids.slice(offset, offset + 6);
      await retryMetadataRequest(async (signal) => {
        const requested = missing;
        const values = await YoutubeApi.request<Record<string, unknown>>("batch_get_meta", { ids: requested }, "POST", 60000, signal);
        if (signal.aborted) throw new Error("YouTube metadata request expired");
        const tracks = Object.values(values).flatMap((value) => {
          const track = normalizeYoutubeTrack(value);
          return track && (track.title || track.artist) && requested.includes(track.id) ? [track] : [];
        });
        rememberYoutubeTracks(tracks);
        const resolved = tracks.map((track) => track.id);
        patchMetadata(resolved);
        missing = requested.filter((id) => !get(youtubeMeta)[id]);
        if (missing.length) throw new Error("Incomplete YouTube metadata response");
      }, 60000);
    }
  } catch (error) {
    logger.warn("[YouTube Music] Metadata unavailable after retry", error);
    if (isYoutubeAuthError(error)) youtubeStatus.update((s) => ({ ...s, authorized: false }));
  } finally {
    for (const id of ids) {
      if (!get(youtubeMeta)[id]) failedMeta.set(id, Date.now() + METADATA_FAILURE_COOLDOWN);
      else failedMeta.delete(id);
      pendingMeta.delete(id);
    }
    patchMetadata(ids);
  }
}

export async function fetchYoutubeMeta(urls: string[]): Promise<void> {
  const requests = new Set<Promise<void>>();
  const missing: string[] = [];
  const settled: string[] = [];
  for (const id of new Set(urls.map(getYoutubeIdFromUrl).filter(isYoutubeVideoId))) {
    if (get(youtubeMeta)[id]) settled.push(id);
    else if (pendingMeta.has(id)) requests.add(pendingMeta.get(id)!);
    else if (!metadataRetryAllowed(failedMeta, id)) settled.push(id);
    else missing.push(id);
  }
  if (settled.length) patchMetadata(settled);
  if (missing.length) {
    const request = loadMissingMetadata(missing);
    for (const id of missing) pendingMeta.set(id, request);
    requests.add(request);
  }
  await Promise.all(requests);
}

function enrich(track: Track, meta: YoutubeTrack): Track {
  return {
    ...track, ...meta, file: track.file, pos: track.pos,
    // Queue identity belongs to MPD. Source ids are recovered from the URI.
    id: track.id ?? meta.id,
    _uid: track._uid ?? String(track.id ?? `${track.pos}:${track.file}`),
    time: track.time || meta.time,
    isMetadataPending: false,
  };
}

async function addUri(uri: string): Promise<number> {
  const id = getYoutubeIdFromUrl(uri);
  if (!id) throw new Error("Invalid YouTube Music track");
  const response = await mpdClient.send(`addid "${youtubeStreamUrl(id)}"`);
  const songId = Number.parseInt(MpdParser.parseKeyValue(response).id);
  if (!Number.isFinite(songId)) throw new Error("MPD could not add the YouTube Music track");
  return songId;
}

export const youtubeSource: TrackSource = {
  id: "youtube",
  streamsHaveElapsed: true,
  brandIcon: ICONS.YOUTUBE,
  routes: youtubeRoutes,
  matches: (file) => getYoutubeIdFromUrl(file) !== null,
  enrichQueueTrack(track, toFetch) {
    const id = getYoutubeIdFromUrl(track.file);
    const meta = id ? get(youtubeMeta)[id] : undefined;
    if (meta) return enrich(track, meta);
    if (id && !metadataRetryAllowed(failedMeta, id)) return metadataFallback({ ...track, service: "youtube" });
    toFetch.push(track.file);
    return null;
  },
  fetchQueueMeta: fetchYoutubeMeta,
  enrichCurrentSong(song, mpdStatus: MpdStatus) {
    const id = getYoutubeIdFromUrl(song.file);
    const meta = id ? get(youtubeMeta)[id] : undefined;
    if (!meta) {
      if (id && !metadataRetryAllowed(failedMeta, id)) {
        Object.assign(song, metadataFallback({ ...song, service: "youtube" }));
        return;
      }
      if (id) {
        song.title = "";
        song.artist = "";
        song.album = "";
        song.image = undefined;
        song.service = "youtube";
        song.isMetadataPending = true;
      }
      void fetchYoutubeMeta([song.file]);
      return;
    }
    Object.assign(song, enrich(song, meta));
    if (!mpdStatus.duration) mpdStatus.duration = meta.time;
  },
  async prepareUri(uri, signal) {
    const id = getYoutubeIdFromUrl(uri);
    if (!id) return;
    let request = preparingAudio.get(id);
    if (!request) {
      request = YoutubeApi.request<{ track?: unknown }>("prepare_track", { id }, "POST");
      preparingAudio.set(id, request);
      void request.finally(() => { if (preparingAudio.get(id) === request) preparingAudio.delete(id); }).catch(() => {});
    }
    const response = await new Promise<{ track?: unknown }>((resolve, reject) => {
      const abort = () => reject(new DOMException("Playback selection changed", "AbortError"));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      request!.then((value) => resolve(value as { track?: unknown }), reject)
        .finally(() => signal?.removeEventListener("abort", abort));
    });
    const meta = normalizeYoutubeTrack(response.track);
    if (meta) {
      rememberYoutubeTracks([meta]);
      currentSong.update((song) => getYoutubeIdFromUrl(song.file) === id ? { ...song, time: meta.time } : song);
      if (getYoutubeIdFromUrl(get(currentSong).file) === id) status.update((s) => ({ ...s, duration: meta.time || s.duration }));
    }
  },
  async playUri(uri, currentPos, isCurrent = () => true) {
    const id = getYoutubeIdFromUrl(uri);
    if (!id) return false;
    if (!isCurrent()) return true;
    const songId = await addUri(uri);
    if (!isCurrent()) { await mpdClient.send(`deleteid ${songId}`); return true; }
    await mpdClient.send(`moveid ${songId} ${Number.isFinite(currentPos) ? currentPos + 1 : 0}`);
    if (!isCurrent()) { await mpdClient.send(`deleteid ${songId}`); return true; }
    await mpdClient.send(`playid ${songId}`);
    return true;
  },
  async addToQueue(uri) {
    if (!uri.startsWith("youtube:")) return false;
    await addUri(uri);
    showToast("Added to queue", "success");
    return true;
  },
  async playNext(uri, currentPos) {
    if (!uri.startsWith("youtube:")) return false;
    const songId = await addUri(uri);
    await mpdClient.send(`moveid ${songId} ${currentPos + 1}`);
    return true;
  },
  isQueueNavigable: () => true,
  matchesPlaying(track, file) {
    const playingId = getYoutubeIdFromUrl(file);
    return playingId !== null && (getYoutubeIdFromUrl(track.file) ?? track.id) === playingId;
  },
  isLiked: (track) => get(youtubeFavorites).has(getYoutubeIdFromUrl(track.file) ?? track.id ?? ""),
  async toggleLike(track) {
    const id = getYoutubeIdFromUrl(track.file) ?? track.id;
    if (!isYoutubeVideoId(id)) return;
    const liked = get(youtubeFavorites).has(id);
    const setLiked = (value: boolean) => youtubeFavorites.update((ids) => {
      const next = new Set(ids);
      if (value) next.add(id); else next.delete(id);
      return next;
    });
    setLiked(!liked);
    try {
      await YoutubeApi.request("rate_song", { id, rating: liked ? "INDIFFERENT" : "LIKE" }, "POST");
      youtubeMeta.update((cache) => cache[id] ? { ...cache, [id]: { ...cache[id], liked: !liked } } : cache);
    } catch (error) {
      setLiked(liked);
      showToast(error instanceof Error ? error.message : "Could not update YouTube Music likes", "error");
    }
  },
  navigateToArtist(track) {
    const id = getYoutubeIdFromUrl(track.file) ?? track.id;
    const artistId = id ? get(youtubeMeta)[id]?.artistId : undefined;
    activeMenuTab.set("youtube");
    resetNavigation();
    if (artistId) navigateTo("youtube_artist_details", { id: artistId });
    else if (track.artist) navigateTo("youtube_search", { query: track.artist, filter: "artists" });
  },
  async startRadioByTrack(track) {
    const id = getYoutubeIdFromUrl(track.file) ?? track.id;
    if (!isYoutubeVideoId(id)) return;
    try { await YoutubeService.startRadio(id); } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not start YouTube Music radio", "error");
    }
  },
  async startRadioByArtist(track) {
    const id = getYoutubeIdFromUrl(track.file) ?? track.id;
    const artistId = id ? get(youtubeMeta)[id]?.artistId : undefined;
    try {
      if (!artistId) throw new Error("Artist radio is unavailable for this track");
      const artist = await YoutubeApi.artist(artistId);
      if (!artist.tracks.length) throw new Error("No artist tracks remain after filtering");
      await YoutubeService.startRadio(artist.tracks[0].id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not start artist radio", "error");
    }
  },
  async showLyrics(track) {
    const id = getYoutubeIdFromUrl(track.file) ?? track.id;
    if (!isYoutubeVideoId(id)) return;
    try {
      const result = await YoutubeApi.lyrics(id);
      showModal({ title: track.title || "Lyrics", type: "alert", confirmLabel: "Close",
        message: result.lyrics ? `${result.lyrics}${result.source ? `\n\n${result.source}` : ""}` : "Lyrics are not available for this track." });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load lyrics", "error");
    }
  },
};

registerTrackSource(youtubeSource);
