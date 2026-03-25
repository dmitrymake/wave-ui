import { get } from "svelte/store";
import { mpdClient } from "./client";
import { MpdParser } from "./parser";
import {
  status,
  currentSong,
  stations,
  showToast,
  queueVersion,
  queue,
  isQueueLocked,
  yandexContext,
} from "../store";
import { db } from "../db";
import { ApiActions } from "../api";
import { YandexApi } from "../yandex";
import { isRemoteUrl, findStationByStream } from "../utils";
import { MSG } from "../messages";
import { logger } from "../logger";
import type { Track, MpdStatus, CurrentSong, Station, YandexContext, YandexTrack } from "../types";

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

function escapePath(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .normalize("NFC")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

export function startStatusPoller(): void {
  stopStatusPoller();
  isInitialSync = true;
  forceHardSync = false;
  ignoreUpdatesUntil = 0;
  isQueueLocked.set(false);

  refreshStatus();
  statusPoller = setInterval(() => {
    if (mpdClient.isConnected && !mpdClient.isProcessing) {
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

function getYandexIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let match: RegExpMatchArray | null = url.match(/[?&]track-id=([^&]+)/);
  if (match) return match[1];
  match = url.match(/[?&]id=([^&]+)/);
  if (match) return match[1];
  match = url.match(/\/track\/(\d+)/);
  if (match) return match[1];
  return null;
}

async function syncQueue(newVersion: number): Promise<void> {
  if (get(isQueueLocked)) return;

  try {
    const text: string = await mpdClient.send("playlistinfo");
    if (get(isQueueLocked)) return;

    const rawTracks: Track[] = MpdParser.parseTracks(text);
    const yCtx: YandexContext = get(yandexContext);

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

    const tracks: Track[] = rawTracks.map((t) => {
      const fileUrl: string = t.file || "";
      const isYandex: boolean =
        fileUrl.includes("yandex.net") ||
        fileUrl.includes("get-mp3") ||
        fileUrl.startsWith("yandex:") ||
        fileUrl.includes("storage.yandex.net");

      if (isYandex && yCtx.streamCache) {
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

      if (isYandex) {
        fetchYandexMetaForTrack(fileUrl);
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
          isYandex: isYandex,
          _uid: String(t.id ?? `${t.pos}:${t.file}`),
        };
      }

      return {
        ...t,
        isYandex: isYandex,
        _uid: String(t.id ?? `${t.pos}:${t.file}`),
      };
    });

    queue.set(tracks);
    queueVersion.set(newVersion);
  } catch (e) {
    logger.error("Queue sync error", e);
  }
}

async function fetchYandexMetaForTrack(url: string): Promise<void> {
  const yCtx: YandexContext = get(yandexContext);
  if (yCtx.streamCache && yCtx.streamCache[url]) return;

  const tId: string | null = getYandexIdFromUrl(url);
  if (tId && yCtx.streamCache && yCtx.streamCache[tId]) return;

  const meta = await ApiActions.getYandexMeta(url);
  if (meta) {
    yandexContext.update((ctx) => {
      const newCache = { ...ctx.streamCache };
      newCache[url] = { ...meta, isYandex: true as const, file: url };
      if (meta.id) {
        newCache[String(meta.id)] = { ...meta, isYandex: true as const, file: url };
      }
      return { ...ctx, streamCache: newCache };
    });

    const song: CurrentSong = get(currentSong);
    if (song.file === url) {
      currentSong.update((s) => ({ ...s, ...meta, isYandex: true }));

      status.update((s) => {
        if (meta.time && (s.duration === 0 || isNaN(s.duration))) {
          return { ...s, duration: parseFloat(String(meta.time)) };
        }
        return s;
      });
    }

    queue.update((q) =>
      q.map((t) => {
        if (t.file === url)
          return { ...t, ...meta, isYandex: true, time: meta.time || t.time };
        return t;
      }),
    );
  }
}

function enrichWithYandexMeta(
  serverSong: CurrentSong,
  serverStatus: MpdStatus,
  yCtx: YandexContext,
): void {
  if (!serverSong.file) return;

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
    serverSong.album = yMeta.album;
    serverSong.image = yMeta.image;
    serverSong.isYandex = true;
    serverSong.id = String(yMeta.id);
    if (serverStatus.duration === 0 || isNaN(serverStatus.duration)) {
      if (yMeta.time) serverStatus.duration = parseFloat(String(yMeta.time));
    }
  } else if (
    serverSong.file.includes("yandex.net") ||
    serverSong.file.includes("get-mp3")
  ) {
    fetchYandexMetaForTrack(serverSong.file);
  }
}

function resolveStationName(
  serverSong: CurrentSong,
  oldSong: CurrentSong,
  allStations: Station[],
): void {
  const isRadio = !!isRemoteUrl(serverSong.file);
  if (!isRadio || serverSong.isYandex) return;

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
): void {
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
      if (isRadio && !serverSong.isYandex) serverStatus.elapsed = 0;
      manageTicker(isPlaying && (!isRadio || !!serverSong.isYandex));
      return serverStatus;
    }

    if (now < ignoreUpdatesUntil) return localStatus;

    if (forceHardSync) {
      forceHardSync = false;
      timeDriftSpeed = 1.0;
      manageTicker(isPlaying && (!isRadio || !!serverSong.isYandex));
      return serverStatus;
    }

    if (isPlaying && (!isRadio || !!serverSong.isYandex)) {
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
  const yCtx = get(yandexContext);

  enrichWithYandexMeta(serverSong, serverStatus, yCtx);
  resolveStationName(serverSong, oldSong, get(stations));
  currentSong.set(serverSong);

  const isRadio = !!isRemoteUrl(serverSong.file);
  reconcileStatus(serverStatus, serverSong, oldSong, isRadio);
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
    await mpdClient.send(isPlaying ? "pause 1" : "play");
    setTimeout(refreshStatus, 900);
  },

  async next(): Promise<void> {
    forceHardSync = true;
    ignoreUpdatesUntil = performance.now() + 1000;
    currentSong.update((s) => ({ ...s, title: "Loading...", artist: "" }));
    status.update((s) => ({ ...s, elapsed: 0 }));
    stopTicker();
    await mpdClient.send("next");
    refreshStatus();
  },

  async previous(): Promise<void> {
    forceHardSync = true;
    ignoreUpdatesUntil = performance.now() + 1000;
    currentSong.update((s) => ({ ...s, title: "Loading...", artist: "" }));
    status.update((s) => ({ ...s, elapsed: 0 }));
    stopTicker();
    await mpdClient.send("previous");
    refreshStatus();
  },

  async setVolume(val: number): Promise<void> {
    status.update((s) => ({ ...s, volume: val }));
    await mpdClient.send(`setvol ${val}`);
  },

  async seek(seconds: number): Promise<void> {
    forceHardSync = true;
    ignoreUpdatesUntil = performance.now() + 500;
    status.update((s) => ({ ...s, elapsed: seconds }));
    await mpdClient.send(`seekcur ${seconds}`);
    setTimeout(refreshStatus, 600);
  },

  async toggleRandom(): Promise<void> {
    const s: MpdStatus = get(status);
    const newVal: boolean = !s.random;
    status.update((curr) => ({ ...curr, random: newVal }));
    await mpdClient.send(`random ${newVal ? 1 : 0}`);
  },

  async toggleRepeat(): Promise<void> {
    const s: MpdStatus = get(status);
    const newVal: boolean = !s.repeat;
    status.update((curr) => ({ ...curr, repeat: newVal }));
    await mpdClient.send(`repeat ${newVal ? 1 : 0}`);
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

      if (uri.startsWith("yandex:")) {
        const id: string = uri.split(":")[1];
        await YandexApi.request("play_track", { id, append: 1 });

        const statusRes: string = await mpdClient.send("status");
        const len: number = parseInt(MpdParser.parseKeyValue(statusRes).playlistlength);
        const targetPos: number = isNaN(currentPos) ? 0 : currentPos + 1;

        if (len > 0) {
          await mpdClient.send(`move ${len - 1} ${targetPos}`);
          await mpdClient.send(`play ${targetPos}`);
        }
      } else {
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
    if (uri.startsWith("yandex:")) {
      const id: string = uri.split(":")[1];
      await YandexApi.request("add_tracks", { tracks: [{ id }] }, "POST");
      showToast(MSG.PLAY_ADDED_TO_QUEUE, "success");
      return;
    }

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
        if (uri.startsWith("yandex:")) {
          const id: string = uri.split(":")[1];
          await YandexApi.request("play_track", { id, append: 1 });

          const statusRes: string = await mpdClient.send("status");
          const len: number = parseInt(
            MpdParser.parseKeyValue(statusRes).playlistlength,
          );

          if (len > 0) {
            await mpdClient.send(`move ${len - 1} ${currentPos + 1}`);
            showToast(MSG.PLAY_WILL_PLAY_NEXT, "success");
          }
        } else {
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

    try {
      queue.update((q) => {
        const copy: Track[] = [...q];
        copy.splice(pos, 1);
        return copy;
      });
      await mpdClient.send(`delete ${pos}`);
    } catch (e) {
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
    const safeName: string = name.replace(/"/g, '\\"');
    try {
      await mpdClient.send(`save "${safeName}"`);
      showToast(MSG.playlistSaved(name), "success");
    } catch (e) {
      if ((e as Error).message.includes("exist")) {
        if (confirm(`Playlist "${name}" exists. Overwrite?`)) {
          try {
            await mpdClient.send(`rm "${safeName}"`);
            await mpdClient.send(`save "${safeName}"`);
            showToast(MSG.playlistOverwritten(name), "success");
          } catch (err) {
            showToast(MSG.PLAY_FAILED_OVERWRITE, "error");
          }
        }
      } else {
        logger.error(e);
      }
    }
  },
};
