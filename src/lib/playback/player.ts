// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { get } from "svelte/store";
import { mpdClient } from "../mpd/client";
import { MpdParser } from "../mpd/parser";
import { escapeArg, escapePath } from "../mpd/escape";
import {
  status,
  currentSong,
  stations,
  showToast,
  showModal,
  queueVersion,
  queue,
  isQueueLocked,
  isQueueLoading,
  queueLoadError,
} from "../store";
import { db } from "../db";
import { resolveSource } from "../sources/trackSource";
import { isRemoteUrl } from "../utils";
import { findStationByStream } from "../radio";
import { MSG } from "../messages";
import { logger } from "../logger";
import type { Track, MpdStatus, CurrentSong, Station } from "../types";
import { pendingPlayback } from "../stores/playback";
import { withMetadataDeadline } from "../sources/metadataRequest";

const POLLER_INTERVAL: number = 1000;
const TICKER_INTERVAL: number = 250;
const QUEUE_LOADING_TIMEOUT = 30_000;
const QUEUE_HYDRATION_TIMEOUT = 5_000;
const QUEUE_METADATA_TIMEOUT = 125_000;

let statusPoller: ReturnType<typeof setInterval> | null = null;
let playbackTicker: ReturnType<typeof setInterval> | null = null;
let lastTickTime: number = 0;
let timeDriftSpeed: number = 1.0;
// Server-position tracking used to detect MPD buffering: while a track is still
// loading, MPD reports state "play" but its elapsed does not move.
let lastServerElapsed: number = -1;
let lastServerElapsedAt: number = 0;

function resetElapsedTracking(): void {
  lastServerElapsed = -1;
  lastServerElapsedAt = 0;
}

let isInitialSync: boolean = true;
let forceHardSync: boolean = false;
let ignoreUpdatesUntil: number = 0;
let queueUnlockTimer: ReturnType<typeof setTimeout> | null = null;
let playbackSequence = 0;
let playbackAbort: AbortController | null = null;
let playbackDeadline: ReturnType<typeof setTimeout> | null = null;
let playbackFallback: { song: CurrentSong; status: MpdStatus } | null = null;
let lastPrefetched = "";
let pollerGeneration = 0;
let queueSyncTask: object | null = null;
let queueLoadingDeadline: ReturnType<typeof setTimeout> | null = null;

function settleQueueLoading(failed: boolean = false): void {
  if (queueLoadingDeadline) clearTimeout(queueLoadingDeadline);
  queueLoadingDeadline = null;
  isQueueLoading.set(false);
  queueLoadError.set(failed);
}

function releaseQueueMetadata(files: string[]): void {
  const missing = new Set(files);
  queue.update((rows) => rows.map((track) => track.isMetadataPending && missing.has(track.file)
    ? { ...track, title: track.title || track.file.split("/").pop() || track.file,
        artist: track.artist || "Unknown Artist", isMetadataPending: false }
    : track));
}

function beginPlayback(track: Track, position: number | null): number {
  if (!get(pendingPlayback)) playbackFallback = { song: get(currentSong), status: get(status) };
  playbackAbort?.abort();
  if (playbackDeadline) clearTimeout(playbackDeadline);
  const sequence = ++playbackSequence;
  playbackAbort = new AbortController();
  pendingPlayback.set({ sequence, track, position, phase: "preparing" });
  applyOptimisticTrack(track);
  status.update((s) => ({ ...s, state: "play", elapsed: 0, duration: track.time || 0, bitrate: 0, format: "", song: position ?? -1, songId: -1 }));
  stopTicker();
  playbackDeadline = setTimeout(() => failPlayback(sequence, new Error("Audio took too long to start; try again")), 75000);
  return sequence;
}

function isCurrentPlayback(sequence: number): boolean {
  return get(pendingPlayback)?.sequence === sequence;
}

function completePlayback(): void {
  if (playbackDeadline) clearTimeout(playbackDeadline);
  playbackDeadline = null;
  playbackAbort = null;
  playbackFallback = null;
  pendingPlayback.set(null);
}

function failPlayback(sequence: number, error: unknown): void {
  if (!isCurrentPlayback(sequence)) return;
  const previous = playbackFallback;
  playbackAbort?.abort();
  completePlayback();
  if (previous) { currentSong.set(previous.song); status.set(previous.status); }
  isQueueLocked.set(false);
  showToast(error instanceof Error ? error.message : MSG.PLAY_FAILED_TO_PLAY, "error");
  forceHardSync = true;
  void refreshStatus();
}

async function preparePlayback(sequence: number, uri: string): Promise<boolean> {
  if (!isCurrentPlayback(sequence)) return false;
  const source = resolveSource(uri);
  await source?.prepareUri?.(uri, playbackAbort?.signal);
  return isCurrentPlayback(sequence);
}

function startingPlayback(sequence: number, position: number | null, songId?: number): void {
  if (!isCurrentPlayback(sequence)) return;
  pendingPlayback.update((pending) => pending ? { ...pending, phase: "starting", position,
    songId: songId ?? pending.track.mpdId } : pending);
  status.update((s) => ({ ...s, song: position ?? s.song }));
  isQueueLocked.set(false);
  forceHardSync = true;
  void refreshStatus();
}

export function startStatusPoller(): void {
  stopStatusPoller();
  isInitialSync = true;
  forceHardSync = false;
  ignoreUpdatesUntil = 0;
  resetElapsedTracking();
  isQueueLocked.set(false);
  queueLoadError.set(false);
  isQueueLoading.set(get(queue).length === 0);
  if (get(isQueueLoading)) {
    queueLoadingDeadline = setTimeout(() => settleQueueLoading(true), QUEUE_LOADING_TIMEOUT);
  }

  refreshStatus();
  statusPoller = setInterval(() => {
    // send() already serializes through a FIFO queue, so polls never collide with
    // an in-flight command; gating on isProcessing only froze status under load.
    if (mpdClient.isConnected) {
      refreshStatus();
    }
  }, POLLER_INTERVAL);
}

export function stopStatusPoller(): void {
  pollerGeneration++;
  queueSyncTask = null;
  if (queueLoadingDeadline) clearTimeout(queueLoadingDeadline);
  queueLoadingDeadline = null;
  isQueueLoading.set(false);
  if (statusPoller) {
    clearInterval(statusPoller);
    statusPoller = null;
  }
  stopTicker();
  playbackAbort?.abort();
  completePlayback();
}

async function refreshStatus(): Promise<void> {
  const generation = pollerGeneration;
  try {
    const statusText: string = await mpdClient.send("status");
    if (generation !== pollerGeneration) return;
    const songText: string = await mpdClient.send("currentsong");
    if (generation !== pollerGeneration) return;

    const newStatus: MpdStatus = MpdParser.parseStatus(statusText);
    const newSong: CurrentSong = MpdParser.parseCurrentSong(songText);

    updateStores(newStatus, newSong);

    const oldVer: number = get(queueVersion);
    const locked: boolean = get(isQueueLocked);

    if (locked) return;

    if (newStatus.playlistLength === 0) {
      queueSyncTask = null;
      if (get(queue).length) queue.set([]);
      queueVersion.set(newStatus.playlistVersion);
      settleQueueLoading();
    } else if (newStatus.playlistVersion !== oldVer || get(queue).length === 0) {
      void syncQueue(newStatus.playlistVersion);
    }
  } catch (e) {
    if (generation !== pollerGeneration) return;
    if (get(isQueueLoading)) settleQueueLoading(true);
    logger.warn("[MPD] Status refresh failed:", e);
  }
}

async function syncQueue(newVersion: number): Promise<void> {
  if (get(isQueueLocked) || queueSyncTask) return;
  const task = {};
  queueSyncTask = task;

  try {
    const text: string = await withMetadataDeadline(() => mpdClient.send("playlistinfo"), QUEUE_LOADING_TIMEOUT);
    if (get(isQueueLocked) || queueSyncTask !== task) return;

    const rawTracks: Track[] = MpdParser.parseTracks(text);

    const filesToLookup: string[] = rawTracks
      .map((t) => t.file)
      .filter((f) => f && !isRemoteUrl(f));

    let cachedMap = new Map<string, Track>();
    if (filesToLookup.length > 0) {
      try {
        // A blocked IndexedDB upgrade must not prevent the MPD queue from rendering.
        cachedMap = await withMetadataDeadline(() => db.getFilesMap(filesToLookup), QUEUE_HYDRATION_TIMEOUT);
      } catch (dbErr) {
        logger.warn("Failed to hydrate queue from DB", dbErr);
      }
    }

    if (get(isQueueLocked) || queueSyncTask !== task || get(status).playlistVersion !== newVersion) return;

    const toFetch: string[] = [];

    const tracks: Track[] = rawTracks.map((t) => {
      const fileUrl: string = t.file || "";
      const source = resolveSource(fileUrl);
      // Neutral source tag: the owning source's id, or undefined for plain local files.
      const service: string | undefined = source?.id;

      // The owning source gets first chance to enrich from its own cache.
      if (source?.enrichQueueTrack) {
        const enriched = source.enrichQueueTrack(t, toFetch);
        if (enriched) return { ...enriched, isMetadataPending: false };
        if (!source.fetchQueueMeta) return { ...t, service, isMetadataPending: false };
        toFetch.push(fileUrl);
        // Cache misses stay on skeletons until the bounded metadata request settles.
        return {
          ...t,
          title: "",
          artist: "",
          album: "",
          image: undefined,
          service,
          _uid: String(t.id ?? `${t.pos}:${t.file}`),
          isMetadataPending: true,
        };
      }

      const lookupKey: string = fileUrl.normalize("NFC");
      const cached = cachedMap.get(lookupKey);

      if (cached) {
        return {
          ...t,
          thumbHash: cached.thumbHash,
          qualityBadge: cached.qualityBadge,
          title: t.title || cached.title,
          artist: t.artist || cached.artist,
          album: t.album || cached.album,
          service,
          _uid: String(t.id ?? `${t.pos}:${t.file}`),
        };
      }

      return {
        ...t,
        service,
        _uid: String(t.id ?? `${t.pos}:${t.file}`),
      };
    });

    queue.set(tracks);
    queueVersion.set(newVersion);
    settleQueueLoading();

    if (toFetch.length) {
      // A queue can contain several streaming services. Each source receives
      // only its own missing URLs; the first track no longer owns the whole batch.
      const batches = new Map<NonNullable<ReturnType<typeof resolveSource>>, string[]>();
      for (const file of new Set(toFetch)) {
        const source = resolveSource(file);
        if (source) batches.set(source, [...(batches.get(source) ?? []), file]);
      }
      for (const [source, files] of batches) {
        void withMetadataDeadline(() => Promise.resolve(source.fetchQueueMeta?.(files)), QUEUE_METADATA_TIMEOUT)
          .catch((e) => logger.warn("Queue metadata error", e))
          .finally(() => releaseQueueMetadata(files));
      }
    }
  } catch (e) {
    if (queueSyncTask !== task) return;
    settleQueueLoading(true);
    logger.error("Queue sync error", e);
  } finally {
    if (queueSyncTask === task) queueSyncTask = null;
  }
}

function resolveStationName(
  serverSong: CurrentSong,
  oldSong: CurrentSong,
  allStations: Station[],
  streamsHaveElapsed: boolean,
): void {
  const isRadio = !!isRemoteUrl(serverSong.file);
  // A streaming-source track (real duration) is never an internet-radio station,
  // even though its file is a remote url, so skip station-name resolution for it.
  if (!isRadio || streamsHaveElapsed) return;

  const found = findStationByStream(allStations, serverSong.file, serverSong.title);
  if (found) {
    serverSong.stationName = found.name;
  } else if (oldSong.stationName && oldSong.file === serverSong.file) {
    serverSong.stationName = oldSong.stationName;
  }
}

function reconcileStatus(
  serverStatus: MpdStatus,
  serverSong: CurrentSong,
  oldSong: CurrentSong,
  isRadio: boolean,
  streamsHaveElapsed: boolean,
): void {
  // Tick the elapsed timer when the track has a real duration: either a normal
  // (non-radio) track, or a streaming-source track whose file looks like a remote
  // stream but still exposes elapsed/duration (e.g. Yandex).
  const hasElapsed = !isRadio || streamsHaveElapsed;
  status.update((localStatus) => {
    const isPlaying = serverStatus.state === "play";
    const now = performance.now();

    if (serverStatus.state === "pause" || localStatus.state === "pause") {
      manageTicker(false);
      resetElapsedTracking();
      return now < ignoreUpdatesUntil ? localStatus : serverStatus;
    }

    if (serverSong.file !== oldSong.file || isInitialSync) {
      isInitialSync = false;
      forceHardSync = false;
      timeDriftSpeed = 1.0;
      resetElapsedTracking();
      if (isRadio && !streamsHaveElapsed) serverStatus.elapsed = 0;
      manageTicker(isPlaying && hasElapsed);
      return serverStatus;
    }

    if (now < ignoreUpdatesUntil) return localStatus;

    if (forceHardSync) {
      forceHardSync = false;
      timeDriftSpeed = 1.0;
      resetElapsedTracking();
      manageTicker(isPlaying && hasElapsed);
      return serverStatus;
    }

    if (isPlaying && hasElapsed) {
      // MPD flips to "play" before the decoder actually feeds audio: while the
      // track is still loading (a network stream, a slow mount) its elapsed
      // stays put. Running the local ticker freely in that window makes the bar
      // start moving and then snap back once the drift exceeds 2s, so freeze the
      // local clock until the server position advances again. A large negative
      // jump is a real reposition (seek/restart), not buffering — let the drift
      // logic below handle it.
      const wallSeconds = (now - lastServerElapsedAt) / 1000;
      const advanced = serverStatus.elapsed - lastServerElapsed;
      const stalled = lastServerElapsed >= 0 && wallSeconds > 0.3 &&
        advanced > -0.5 && advanced < wallSeconds * 0.25;
      lastServerElapsed = serverStatus.elapsed;
      lastServerElapsedAt = now;
      if (stalled) {
        timeDriftSpeed = 0;
        return { ...serverStatus, elapsed: localStatus.elapsed };
      }
      const diff = serverStatus.elapsed - localStatus.elapsed;
      if (Math.abs(diff) > 2.0) {
        timeDriftSpeed = 1.0;
        return serverStatus;
      }
      if (Math.abs(diff) < 0.05) {
        timeDriftSpeed = 1.0;
      } else {
        timeDriftSpeed = Math.max(0.5, Math.min(1.5, 1.0 + diff / 1.5));
      }
      return { ...serverStatus, elapsed: localStatus.elapsed };
    }

    manageTicker(false);
    resetElapsedTracking();
    return serverStatus;
  });
}

function updateStores(serverStatus: MpdStatus, serverSong: CurrentSong): void {
  const oldSong = get(currentSong);

  const source = resolveSource(serverSong.file);
  source?.enrichCurrentSong?.(serverSong, serverStatus);
  // Capability of the owning source: keep the elapsed timer running for streams
  // that have a real duration (vs internet radio, which has none).
  const streamsHaveElapsed = !!source?.streamsHaveElapsed;

  resolveStationName(serverSong, oldSong, get(stations), streamsHaveElapsed);
  const pending = get(pendingPlayback);
  if (pending) {
    playbackFallback = { song: serverSong, status: serverStatus };
    const targetId = pending.songId ?? pending.track.mpdId;
    // A radio refill/prune can move the selected item to another position between
    // playid and this poll. Confirm its occurrence, never its obsolete position.
    const matches = typeof targetId === "number" && targetId >= 0
      ? serverStatus.songId === targetId
      : !pending.track.file || serverSong.file === pending.track.file ||
        resolveSource(pending.track.file)?.matchesPlaying?.(pending.track, serverSong.file);
    if (pending.phase === "starting" && matches && serverStatus.state === "play" &&
      (serverStatus.elapsed > 0 || (!streamsHaveElapsed && serverStatus.bitrate > 0))) {
      completePlayback();
    } else {
      // Polls describe the old physical song while audio is being prepared.
      // Keep the selected artwork/title and its spinner until MPD starts it.
      status.update((s) => ({ ...s, volume: serverStatus.volume, playlistLength: serverStatus.playlistLength,
        playlistVersion: serverStatus.playlistVersion }));
      return;
    }
  }
  // serverSong is a fresh object every 1s poll, so an unconditional set re-runs
  // isPlayingFile across every list row each second even when the track is unchanged.
  // Optimistic paths set currentSong explicitly, so skipping a no-op poll is safe.
  if (
    !oldSong ||
    oldSong.file !== serverSong.file ||
    oldSong.id !== serverSong.id ||
    oldSong.mpdId !== serverSong.mpdId ||
    oldSong.title !== serverSong.title ||
    oldSong.artist !== serverSong.artist ||
    oldSong.stationName !== serverSong.stationName ||
    oldSong.isMetadataPending !== serverSong.isMetadataPending
  ) {
    currentSong.set(serverSong);
  }

  const isRadio = !!isRemoteUrl(serverSong.file);
  reconcileStatus(serverStatus, serverSong, oldSong, isRadio, streamsHaveElapsed);
  const next = get(queue)[serverStatus.song + 1];
  if (serverStatus.state === "play" && next?.file && resolveSource(next.file)?.prepareUri) {
    const key = `${serverSong.file}:${next.file}`;
    if (key !== lastPrefetched) {
      lastPrefetched = key;
      void resolveSource(next.file)?.prepareUri?.(next.file).catch((error) => logger.warn("[Player] Next track preparation failed", error));
    }
  }
}

function currentQueuePosition(s: MpdStatus, tracks: Track[]): number {
  const pending = get(pendingPlayback);
  const songId = pending?.songId ?? pending?.track.mpdId ?? s.songId;
  if (typeof songId === "number" && songId >= 0) {
    // Match the status to the SAME queue snapshot, even if it was fetched before
    // the daemon removed preceding rows. A missing id falls back to native MPD
    // next/previous, not a guessed index in an unrelated queue version.
    return tracks.findIndex((track) => track.mpdId === songId);
  }
  return pending?.position ?? s.song;
}

function manageTicker(shouldRun: boolean): void {
  if (shouldRun) startTicker();
  else stopTicker();
}

function startTicker(): void {
  if (playbackTicker || isInitialSync) return;
  lastTickTime = performance.now();
  playbackTicker = setInterval(() => {
    const now: number = performance.now();
    let deltaTime: number = (now - lastTickTime) / 1000;
    if (deltaTime > 2.0) deltaTime = 0;
    lastTickTime = now;

    status.update((s) => {
      if (s.state !== "play") return s;
      let newElapsed: number = s.elapsed + deltaTime * timeDriftSpeed;
      if (s.duration > 0 && newElapsed > s.duration) newElapsed = s.duration;
      return { ...s, elapsed: newElapsed };
    });
  }, TICKER_INTERVAL);
}

function stopTicker(): void {
  if (playbackTicker) {
    clearInterval(playbackTicker);
    playbackTicker = null;
  }
  timeDriftSpeed = 1.0;
  lastTickTime = 0;
}

async function sendTracksInChunks(tracks: Track[], playAfter: boolean = false): Promise<void> {
  if (!tracks || tracks.length === 0) return;

  isQueueLocked.set(true);
  forceHardSync = true;

  const CHUNK_SIZE: number = 5;

  try {
    for (let i = 0; i < tracks.length; i += CHUNK_SIZE) {
      const chunk: Track[] = tracks.slice(i, i + CHUNK_SIZE);
      const commands: string[] = ["command_list_begin"];

      chunk.forEach((t) => {
        commands.push(`add "${escapePath(t.file)}"`);
      });
      commands.push("command_list_end");

      await mpdClient.send(commands.join("\n"));
    }

    if (playAfter) {
      await mpdClient.send("play 0");
      showToast(MSG.playingTracks(tracks.length), "success");
    } else {
      showToast(MSG.addedTracks(tracks.length), "success");
    }
  } catch (e) {
    logger.error("[Player] Bulk Action Failed:", e);
    showToast(MSG.PLAY_ERROR_ADDING_TRACKS, "error");
  } finally {
    isQueueLocked.set(false);
    setTimeout(() => refreshStatus(), 500);
  }
}

function applyOptimisticTrack(track: Track): void {
  currentSong.update((s) => ({
    ...s,
    title: track.title,
    artist: track.artist,
    album: track.album,
    file: track.file,
    image: track.image,
    service: track.service,
    id: track.id,
    mpdId: track.mpdId,
    stationName: track.stationName,
  }));
}

// Roll back an optimistic transport mutation when its MPD command fails (typically
// a dead socket). Re-arming the status poller's ignore window would keep the bogus
// optimistic value on screen, so clear it and force a hard re-sync; the next poll —
// or, if the socket is down, the eventual reconnect — restores the true state. The
// error is logged rather than swallowed so a silent no-op never masquerades as success.
function rollbackOptimistic(context: string, e: unknown): void {
  logger.error(`[Player] ${context} failed`, e);
  ignoreUpdatesUntil = 0;
  forceHardSync = true;
  if (mpdClient.isConnected) refreshStatus();
}

export const PlayerActions = {
  async togglePlay(): Promise<void> {
    if (get(pendingPlayback)) {
      // Loading must never lock the user out of transport controls. Cancel the
      // optimistic selection, then pause physical MPD even if it has already
      // started a track whose confirmation poll has not reached the UI yet.
      const physical = playbackFallback;
      playbackAbort?.abort();
      completePlayback();
      isQueueLocked.set(false);
      ignoreUpdatesUntil = 0;
      forceHardSync = true;
      stopTicker();
      if (physical) {
        currentSong.set(physical.song);
        status.set({ ...physical.status, state: "pause" });
      } else {
        status.update((value) => ({ ...value, state: "pause" }));
      }
      try {
        await mpdClient.send("pause 1");
      } catch (error) {
        rollbackOptimistic("cancelLoading", error);
        return;
      }
      await refreshStatus();
      return;
    }
    const s: MpdStatus = get(status);
    const isPlaying: boolean = s.state === "play";
    ignoreUpdatesUntil = performance.now() + 800;
    status.update((curr) => {
      const newState: "play" | "pause" = isPlaying ? "pause" : "play";
      if (newState === "play") startTicker();
      else stopTicker();
      return { ...curr, state: newState };
    });
    try {
      await mpdClient.send(isPlaying ? "pause 1" : "play");
    } catch (e) {
      rollbackOptimistic("togglePlay", e);
      return;
    }
    setTimeout(refreshStatus, 900);
  },

  async next(): Promise<void> {
    forceHardSync = true;
    const s: MpdStatus = get(status);
    const q: Track[] = get(queue);
    const currentPos = currentQueuePosition(s, q);
    const nextPos = currentPos + 1;

    const current: Track | undefined = q[currentPos];
    if (current) {
      resolveSource(current.file)?.onSkip?.(current, s.elapsed);
    }
    if (!s.random && currentPos >= 0 && nextPos < q.length) {
      await this.playQueuePosition(nextPos);
      return;
    }

    const sequence = beginPlayback({ ...get(currentSong), mpdId: undefined, file: "", title: "Loading…", artist: "" }, null);

    ignoreUpdatesUntil = performance.now() + 600;
    status.update((s) => ({ ...s, elapsed: 0 }));
    stopTicker();
    try {
      await mpdClient.send("next");
    } catch (e) {
      failPlayback(sequence, e);
      rollbackOptimistic("next", e);
      return;
    }
    startingPlayback(sequence, null);
  },

  async previous(): Promise<void> {
    forceHardSync = true;
    const s: MpdStatus = get(status);
    const q: Track[] = get(queue);
    const prevPos = currentQueuePosition(s, q) - 1;

    if (!s.random && prevPos >= 0 && prevPos < q.length) {
      await this.playQueuePosition(prevPos);
      return;
    }

    const sequence = beginPlayback({ ...get(currentSong), mpdId: undefined, file: "", title: "Loading…", artist: "" }, null);

    ignoreUpdatesUntil = performance.now() + 600;
    status.update((s) => ({ ...s, elapsed: 0 }));
    stopTicker();
    try {
      await mpdClient.send("previous");
    } catch (e) {
      failPlayback(sequence, e);
      rollbackOptimistic("previous", e);
      return;
    }
    startingPlayback(sequence, null);
  },

  async setVolume(val: number): Promise<void> {
    // MPD setvol expects an integer 0-100 and ACKs out-of-range/fractional values.
    const v: number = Math.max(0, Math.min(100, Math.round(val)));
    status.update((s) => ({ ...s, volume: v }));
    try {
      await mpdClient.send(`setvol ${v}`);
    } catch (e) {
      rollbackOptimistic("setVolume", e);
    }
  },

  async seek(seconds: number): Promise<void> {
    if (get(pendingPlayback)) return;
    forceHardSync = true;
    ignoreUpdatesUntil = performance.now() + 500;
    const duration: number = get(status).duration;
    const t: number = Math.max(0, Math.min(seconds, duration || seconds));
    status.update((s) => ({ ...s, elapsed: t }));
    try {
      await mpdClient.send(`seekcur ${t}`);
    } catch (e) {
      rollbackOptimistic("seek", e);
      return;
    }
    setTimeout(refreshStatus, 600);
  },

  async toggleRandom(): Promise<void> {
    const s: MpdStatus = get(status);
    const newVal: boolean = !s.random;
    status.update((curr) => ({ ...curr, random: newVal }));
    try {
      await mpdClient.send(`random ${newVal ? 1 : 0}`);
    } catch (e) {
      rollbackOptimistic("toggleRandom", e);
    }
  },

  async toggleRepeat(): Promise<void> {
    const s: MpdStatus = get(status);
    const newVal: boolean = !s.repeat;
    status.update((curr) => ({ ...curr, repeat: newVal }));
    try {
      await mpdClient.send(`repeat ${newVal ? 1 : 0}`);
    } catch (e) {
      rollbackOptimistic("toggleRepeat", e);
    }
  },

  async playUri(uri: string, meta: Partial<Track> = {}): Promise<void> {
    if (get(pendingPlayback)?.track.file === uri) return;
    isQueueLocked.set(true);
    const safeUri: string = escapePath(uri);
    forceHardSync = true;

    const sequence = beginPlayback({ title: "Loading…", artist: "", album: "", genre: "", time: 0,
      track: "", ...meta, file: uri }, null);

    try {
      if (!await preparePlayback(sequence, uri)) return;
      const songData: string = await mpdClient.send("currentsong");
      const currentPos: number = parseInt(MpdParser.parseKeyValue(songData).pos);
      if (!isCurrentPlayback(sequence)) return;
      const targetPos = Number.isFinite(currentPos) ? currentPos + 1 : 0;

      const source = resolveSource(uri);
      const handled = source?.playUri ? await source.playUri(uri, currentPos, () => isCurrentPlayback(sequence)) : false;
      if (!handled) {
        const res: string = await mpdClient.send(`addid "${safeUri}"`);
        const newId: number = parseInt(MpdParser.parseKeyValue(res).id);

        if (!isNaN(newId)) {
          if (!isCurrentPlayback(sequence)) { await mpdClient.send(`deleteid ${newId}`); return; }
          await mpdClient.send(`moveid ${newId} ${targetPos}`);
          await mpdClient.send(`playid ${newId}`);
        } else {
          await mpdClient.send(`add "${safeUri}"`);
          await mpdClient.send("play");
        }
      }
      startingPlayback(sequence, targetPos);
    } catch (e) {
      logger.error("Play error", e);
      // Roll back the optimistic Loading… row so the previous track returns.
      failPlayback(sequence, e);
    }

    if (isCurrentPlayback(sequence)) isQueueLocked.set(false);
    setTimeout(() => refreshStatus(), 500);
  },

  async addToQueue(uri: string): Promise<void> {
    const source = resolveSource(uri);
    if (source?.addToQueue && (await source.addToQueue(uri))) return;

    try {
      await mpdClient.send(`add "${escapePath(uri)}"`);
      showToast(MSG.PLAY_ADDED_TO_QUEUE, "success");
    } catch (e) {
      logger.error("Add queue error", e);
      showToast(MSG.PLAY_FAILED_TO_ADD, "error");
    }
  },

  async playNext(uri: string): Promise<void> {
    isQueueLocked.set(true);
    const safeUri: string = escapePath(uri);
    try {
      const songData: string = await mpdClient.send("currentsong");
      const currentPos: number = parseInt(MpdParser.parseKeyValue(songData).pos || "-1");

      if (currentPos === -1) {
        isQueueLocked.set(false);
        await this.playUri(uri);
      } else {
        const source = resolveSource(uri);
        const handled = source?.playNext
          ? await source.playNext(uri, currentPos)
          : false;
        if (!handled) {
          const res: string = await mpdClient.send(`addid "${safeUri}"`);
          const newId: number = parseInt(MpdParser.parseKeyValue(res).id);

          if (!isNaN(newId)) {
            await mpdClient.send(`moveid ${newId} ${currentPos + 1}`);
            showToast(MSG.PLAY_WILL_PLAY_NEXT, "success");
          }
        }
        if (queueUnlockTimer) clearTimeout(queueUnlockTimer);
        queueUnlockTimer = setTimeout(() => isQueueLocked.set(false), 1000);
      }
    } catch (e) {
      logger.error("Play Next error", e);
      showToast(MSG.PLAY_FAILED_SET_NEXT, "error");
      isQueueLocked.set(false);
    }
  },

  async removeFromQueue(pos: number): Promise<void> {
    isQueueLocked.set(true);
    if (queueUnlockTimer) clearTimeout(queueUnlockTimer);

    // Snapshot before the optimistic splice. If MPD rejects the delete we restore it,
    // otherwise the local queue stays shorter than MPD and later index-based
    // move/remove operations would target the wrong track.
    let previous: Track[] = [];
    queue.update((q) => {
      previous = q;
      const copy: Track[] = [...q];
      copy.splice(pos, 1);
      return copy;
    });

    try {
      await mpdClient.send(`delete ${pos}`);
    } catch (e) {
      logger.error("Remove failed", e);
      queue.set(previous);
      showToast(MSG.PLAY_FAILED_REMOVE, "error");
      isQueueLocked.set(false);
      return;
    }
    queueUnlockTimer = setTimeout(() => {
      isQueueLocked.set(false);
    }, 1000);
  },

  async moveTrack(fromPos: number, toPos: number): Promise<void> {
    if (fromPos === toPos) return;

    isQueueLocked.set(true);
    if (queueUnlockTimer) clearTimeout(queueUnlockTimer);

    try {
      await mpdClient.send(`move ${fromPos} ${toPos}`);
    } catch (e) {
      logger.error("Move failed", e);
      showToast(MSG.PLAY_MOVE_FAILED, "error");
      isQueueLocked.set(false);
      refreshStatus();
      return;
    }

    queueUnlockTimer = setTimeout(() => {
      isQueueLocked.set(false);
      refreshStatus();
    }, 2000);
  },

  async playQueuePosition(pos: number): Promise<void> {
    const track = get(queue)[pos];
    if (!track) {
      try { await mpdClient.send(`play ${pos}`); } catch (e) { showToast(MSG.PLAY_FAILED_TO_PLAY, "error"); }
      return;
    }
    const pending = get(pendingPlayback);
    if (pending && (track.mpdId !== undefined
      ? (pending.songId ?? pending.track.mpdId) === track.mpdId
      : pending.position === pos && pending.track.file === track.file)) return;
    const sequence = beginPlayback(track, pos);
    try {
      // Use the id attached to this queue snapshot. Re-reading its position can
      // resolve a DIFFERENT item after the daemon prunes preceding tracks.
      const id = track.mpdId ?? await this.getQueueItemIdAt(pos);
      if (!await preparePlayback(sequence, track.file)) return;
      if (Number.isFinite(id)) {
        const details = MpdParser.parseKeyValue(await mpdClient.send(`playlistid ${id}`));
        if (!isCurrentPlayback(sequence)) return;
        const position = Number.parseInt(details.pos);
        if (details.file && details.file !== track.file &&
            !resolveSource(track.file)?.matchesPlaying?.(track, details.file)) {
          throw new Error("Queue changed while selecting the track; try again");
        }
        await mpdClient.send(`playid ${id}`);
        startingPlayback(sequence, Number.isFinite(position) ? position : pos, id);
      } else {
        await mpdClient.send(`play ${pos}`);
        startingPlayback(sequence, pos);
      }
    } catch (e) {
      logger.error("[Player] playQueuePosition failed", e);
      failPlayback(sequence, e);
    }
  },

  async clearQueue(): Promise<void> {
    // Lock the queue so the 1s status poller's syncQueue cannot race the
    // optimistic wipe and briefly repopulate the view from a stale playlistinfo
    // snapshot, matching removeFromQueue/moveTrack.
    isQueueLocked.set(true);
    if (queueUnlockTimer) clearTimeout(queueUnlockTimer);

    // Snapshot before the optimistic wipe. If MPD rejects `clear` we restore the
    // queue, now-playing slot, and status so the view never lies about an empty
    // queue while the server still holds tracks.
    const prevQueue: Track[] = get(queue);
    const prevSong: CurrentSong = get(currentSong);
    const prevStatus: MpdStatus = get(status);

    // Optimistically empty the local queue and reset the now-playing slot so the
    // view updates instantly; the MPD `clear` command then reconciles the server.
    queue.set([]);
    currentSong.set({
      title: "Not Playing",
      artist: "",
      album: "",
      file: "",
      genre: "",
      time: 0,
      track: "",
      stationName: null,
      id: undefined,
      pos: null,
    });
    status.update((s) => ({
      ...s,
      state: "stop",
      song: -1,
      songId: -1,
      elapsed: 0,
    }));

    try {
      await mpdClient.send("clear");
    } catch (e) {
      logger.error("Clear queue failed", e);
      queue.set(prevQueue);
      currentSong.set(prevSong);
      status.set(prevStatus);
      showToast(MSG.PLAY_FAILED_REMOVE, "error");
      isQueueLocked.set(false);
      return;
    }
    queueUnlockTimer = setTimeout(() => {
      isQueueLocked.set(false);
    }, 1000);
  },

  async playAllTracks(tracks: Track[], beforeReplace?: () => Promise<void>): Promise<void> {
    if (!tracks || tracks.length === 0) return;
    const sequence = beginPlayback(tracks[0], 0);
    try {
      if (!await preparePlayback(sequence, tracks[0].file)) return;
      await beforeReplace?.();
      if (!isCurrentPlayback(sequence)) return;
      await mpdClient.send("stop");
      await mpdClient.send("clear");
      await sendTracksInChunks(tracks, true);
      startingPlayback(sequence, 0);
    } catch (e) {
      logger.error(e);
      failPlayback(sequence, e);
    }
  },

  async addAllToQueue(tracks: Track[]): Promise<void> {
    if (!tracks || tracks.length === 0) return;
    await sendTracksInChunks(tracks, false);
  },

  async saveQueue(name: string): Promise<void> {
    if (!name) return;
    const safeName: string = escapeArg(name);

    const write = async (overwrite: boolean): Promise<void> => {
      try {
        if (overwrite) await mpdClient.send(`rm "${safeName}"`);
        await mpdClient.send(`save "${safeName}"`);
        showToast(
          overwrite ? MSG.playlistOverwritten(name) : MSG.playlistSaved(name),
          "success",
        );
      } catch (err) {
        logger.error(err);
        showToast(
          overwrite ? MSG.PLAY_FAILED_OVERWRITE : MSG.PLAY_FAILED_TO_SAVE,
          "error",
        );
      }
    };

    // Detect an existing playlist proactively via listplaylists rather than by
    // substring-matching the ACK text, and confirm overwrite with the async modal
    // instead of a blocking confirm() that stalls the command queue.
    let exists = false;
    try {
      const list: string = await mpdClient.send("listplaylists");
      exists = MpdParser.parsePlaylists(list).some((p) => p.name === name);
    } catch (e) {
      logger.error(e);
    }

    if (exists) {
      showModal({
        title: "Overwrite Playlist",
        message: `Playlist "${name}" already exists. Overwrite it?`,
        type: "confirm",
        confirmLabel: "Overwrite",
        onConfirm: () => {
          write(true);
        },
      });
    } else {
      await write(false);
    }
  },

  async getQueueLength(): Promise<number> {
    const text: string = await mpdClient.send("status");
    return parseInt(MpdParser.parseKeyValue(text).playlistlength);
  },

  async getQueueItemIdAt(pos: number): Promise<number> {
    const text: string = await mpdClient.send(`playlistinfo ${pos}`);
    return parseInt(MpdParser.parseKeyValue(text).id);
  },

  async moveById(songId: number, toPos: number): Promise<void> {
    await mpdClient.send(`moveid ${songId} ${toPos}`);
  },

  async playById(songId: number): Promise<void> {
    await mpdClient.send(`playid ${songId}`);
  },

  async deleteById(songId: number): Promise<void> {
    await mpdClient.send(`deleteid ${songId}`);
  },
};
