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
} from "../store";
import { db } from "../db";
import { resolveSource } from "../sources/trackSource";
import { isRemoteUrl } from "../utils";
import { findStationByStream } from "../radio";
import { MSG } from "../messages";
import { logger } from "../logger";
import type { Track, MpdStatus, CurrentSong, Station } from "../types";

const POLLER_INTERVAL: number = 1000;
const TICKER_INTERVAL: number = 250;

let statusPoller: ReturnType<typeof setInterval> | null = null;
let playbackTicker: ReturnType<typeof setInterval> | null = null;
let lastTickTime: number = 0;
let timeDriftSpeed: number = 1.0;

let isInitialSync: boolean = true;
let forceHardSync: boolean = false;
let ignoreUpdatesUntil: number = 0;
let queueUnlockTimer: ReturnType<typeof setTimeout> | null = null;

export function startStatusPoller(): void {
  stopStatusPoller();
  isInitialSync = true;
  forceHardSync = false;
  ignoreUpdatesUntil = 0;
  isQueueLocked.set(false);

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
  if (statusPoller) {
    clearInterval(statusPoller);
    statusPoller = null;
  }
  stopTicker();
}

async function refreshStatus(): Promise<void> {
  try {
    const statusText: string = await mpdClient.send("status");
    const songText: string = await mpdClient.send("currentsong");

    const newStatus: MpdStatus = MpdParser.parseStatus(statusText);
    const newSong: CurrentSong = MpdParser.parseCurrentSong(songText);

    updateStores(newStatus, newSong);

    const oldVer: number = get(queueVersion);
    const locked: boolean = get(isQueueLocked);

    if (locked) return;

    if (
      (newStatus.playlistLength > 0 && newStatus.playlistVersion !== oldVer) ||
      (newStatus.playlistLength > 0 && get(queue).length === 0)
    ) {
      syncQueue(newStatus.playlistVersion);
    }
  } catch (e) {
    logger.warn("[MPD] Status refresh failed:", e);
  }
}

async function syncQueue(newVersion: number): Promise<void> {
  if (get(isQueueLocked)) return;

  try {
    const text: string = await mpdClient.send("playlistinfo");
    if (get(isQueueLocked)) return;

    const rawTracks: Track[] = MpdParser.parseTracks(text);

    const filesToLookup: string[] = rawTracks
      .map((t) => t.file)
      .filter((f) => f && !isRemoteUrl(f));

    let cachedMap = new Map<string, Track>();
    if (filesToLookup.length > 0) {
      try {
        cachedMap = await db.getFilesMap(filesToLookup);
      } catch (dbErr) {
        logger.warn("Failed to hydrate queue from DB", dbErr);
      }
    }

    const toFetch: string[] = [];

    const tracks: Track[] = rawTracks.map((t) => {
      const fileUrl: string = t.file || "";
      const source = resolveSource(fileUrl);
      // Neutral source tag: the owning source's id, or undefined for plain local files.
      const service: string | undefined = source?.id;

      // The owning source gets first chance to enrich from its own cache.
      if (source?.enrichQueueTrack) {
        const enriched = source.enrichQueueTrack(t, toFetch);
        if (enriched) return enriched;
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

    if (toFetch.length) {
      resolveSource(toFetch[0])?.fetchQueueMeta?.(toFetch);
    }
  } catch (e) {
    logger.error("Queue sync error", e);
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
      return now < ignoreUpdatesUntil ? localStatus : serverStatus;
    }

    if (serverSong.file !== oldSong.file || isInitialSync) {
      isInitialSync = false;
      forceHardSync = false;
      timeDriftSpeed = 1.0;
      if (isRadio && !streamsHaveElapsed) serverStatus.elapsed = 0;
      manageTicker(isPlaying && hasElapsed);
      return serverStatus;
    }

    if (now < ignoreUpdatesUntil) return localStatus;

    if (forceHardSync) {
      forceHardSync = false;
      timeDriftSpeed = 1.0;
      manageTicker(isPlaying && hasElapsed);
      return serverStatus;
    }

    if (isPlaying && hasElapsed) {
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
  // serverSong is a fresh object every 1s poll, so an unconditional set re-runs
  // isPlayingFile across every list row each second even when the track is unchanged.
  // Optimistic paths set currentSong explicitly, so skipping a no-op poll is safe.
  if (
    !oldSong ||
    oldSong.file !== serverSong.file ||
    oldSong.id !== serverSong.id ||
    oldSong.title !== serverSong.title ||
    oldSong.artist !== serverSong.artist ||
    oldSong.stationName !== serverSong.stationName
  ) {
    currentSong.set(serverSong);
  }

  const isRadio = !!isRemoteUrl(serverSong.file);
  reconcileStatus(serverStatus, serverSong, oldSong, isRadio, streamsHaveElapsed);
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
    const nextPos = s.song + 1;

    const current: Track | undefined = q[s.song];
    if (current) {
      resolveSource(current.file)?.onSkip?.(current, s.elapsed);
    }

    if (nextPos < q.length && q[nextPos].title) {
      applyOptimisticTrack(q[nextPos]);
    } else {
      currentSong.update((s) => ({ ...s, title: "Loading...", artist: "" }));
    }

    ignoreUpdatesUntil = performance.now() + 600;
    status.update((s) => ({ ...s, elapsed: 0 }));
    stopTicker();
    try {
      await mpdClient.send("next");
    } catch (e) {
      rollbackOptimistic("next", e);
      return;
    }
    refreshStatus();
  },

  async previous(): Promise<void> {
    forceHardSync = true;
    const s: MpdStatus = get(status);
    const q: Track[] = get(queue);
    const prevPos = s.song - 1;

    if (prevPos >= 0 && q[prevPos] && q[prevPos].title) {
      applyOptimisticTrack(q[prevPos]);
    } else {
      currentSong.update((s) => ({ ...s, title: "Loading...", artist: "" }));
    }

    ignoreUpdatesUntil = performance.now() + 600;
    status.update((s) => ({ ...s, elapsed: 0 }));
    stopTicker();
    try {
      await mpdClient.send("previous");
    } catch (e) {
      rollbackOptimistic("previous", e);
      return;
    }
    refreshStatus();
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
    isQueueLocked.set(true);
    const safeUri: string = escapePath(uri);
    forceHardSync = true;

    status.update((s) => ({ ...s, state: "play", elapsed: 0 }));
    currentSong.set({
      title: meta.title || "Loading...",
      artist: meta.artist || "",
      album: meta.album || "",
      file: uri,
      genre: "",
      time: 0,
      track: "",
    });
    stopTicker();

    try {
      const songData: string = await mpdClient.send("currentsong");
      const currentPos: number = parseInt(MpdParser.parseKeyValue(songData).pos);

      const source = resolveSource(uri);
      const handled = source?.playUri ? await source.playUri(uri, currentPos) : false;
      if (!handled) {
        const res: string = await mpdClient.send(`addid "${safeUri}"`);
        const newId: number = parseInt(MpdParser.parseKeyValue(res).id);

        if (!isNaN(newId)) {
          const targetPos: number = isNaN(currentPos) ? 0 : currentPos + 1;
          await mpdClient.send(`moveid ${newId} ${targetPos}`);
          await mpdClient.send(`playid ${newId}`);
        } else {
          await mpdClient.send(`add "${safeUri}"`);
          await mpdClient.send("play");
        }
      }
    } catch (e) {
      logger.error("Play error", e);
      showToast(MSG.PLAY_FAILED_TO_PLAY, "error");
    }

    isQueueLocked.set(false);
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
    try {
      await mpdClient.send(`play ${pos}`);
    } catch (e) {
      logger.error("[Player] playQueuePosition failed", e);
      showToast(MSG.PLAY_FAILED_TO_PLAY, "error");
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

  async playAllTracks(tracks: Track[]): Promise<void> {
    if (!tracks || tracks.length === 0) return;
    try {
      await mpdClient.send("stop");
      await mpdClient.send("clear");
      await sendTracksInChunks(tracks, true);
    } catch (e) {
      logger.error(e);
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
};
