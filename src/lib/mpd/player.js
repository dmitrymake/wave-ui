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
  yandexContext, // IMPORTED
} from "../store";
import { db } from "../db";

const POLLER_INTERVAL = 1000;
const TICKER_INTERVAL = 250;

let statusPoller = null;
let playbackTicker = null;
let lastTickTime = 0;
let timeDriftSpeed = 1.0;

let isInitialSync = true;
let forceHardSync = false;
let ignoreUpdatesUntil = 0;
let queueUnlockTimer = null;

function escapePath(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFC")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

export function startStatusPoller() {
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

export function stopStatusPoller() {
  if (statusPoller) {
    clearInterval(statusPoller);
    statusPoller = null;
  }
  stopTicker();
}

async function refreshStatus() {
  try {
    const statusText = await mpdClient.send("status");
    const songText = await mpdClient.send("currentsong");

    const newStatus = MpdParser.parseStatus(statusText);
    const newSong = MpdParser.parseCurrentSong(songText);

    updateStores(newStatus, newSong);

    const oldVer = get(queueVersion);
    const locked = get(isQueueLocked);

    if (locked) return;

    if (
      (newStatus.playlistLength > 0 && newStatus.playlistVersion !== oldVer) ||
      (newStatus.playlistLength > 0 && get(queue).length === 0)
    ) {
      syncQueue(newStatus.playlistVersion);
    }
  } catch (e) {}
}

async function syncQueue(newVersion) {
  if (get(isQueueLocked)) return;

  try {
    const text = await mpdClient.send("playlistinfo");
    if (get(isQueueLocked)) return;

    const rawTracks = MpdParser.parseTracks(text);

    const filesToLookup = rawTracks
      .map((t) => t.file)
      .filter((f) => f && !f.startsWith("http"));

    let cachedMap = new Map();
    if (filesToLookup.length > 0) {
      try {
        cachedMap = await db.getFilesMap(filesToLookup);
      } catch (dbErr) {
        console.warn("Failed to hydrate queue from DB", dbErr);
      }
    }

    const tracks = rawTracks.map((t) => {
      const lookupKey = (t.file || "").normalize("NFC");
      const cached = cachedMap.get(lookupKey);

      if (cached) {
        return {
          ...t,
          thumbHash: cached.thumbHash,
          qualityBadge: cached.qualityBadge,
          title: t.title || cached.title,
          artist: t.artist || cached.artist,
          album: t.album || cached.album,
          _uid: String(t.id || t.pos + t.file),
        };
      }
      return {
        ...t,
        _uid: String(t.id || t.pos + t.file),
      };
    });

    queue.set(tracks);
    queueVersion.set(newVersion);
  } catch (e) {
    console.error("Queue sync error", e);
  }
}

function updateStores(serverStatus, serverSong) {
  const oldSong = get(currentSong);
  const allStations = get(stations);
  const yCtx = get(yandexContext);

  // YANDEX OVERRIDE LOGIC
  // If the playing URL matches what we expect from Yandex, override metadata
  if (
    yCtx.active &&
    yCtx.tracks.length > 0 &&
    yCtx.currentIndex >= 0 &&
    yCtx.currentTrackFile &&
    serverSong.file === yCtx.currentTrackFile
  ) {
    const yTrack = yCtx.tracks[yCtx.currentIndex];
    if (yTrack) {
      serverSong.title = yTrack.title;
      serverSong.artist = yTrack.artist;
      serverSong.album = yTrack.album;
      serverSong.image = yTrack.image; // Pass image for cover logic
      serverSong.isYandex = true;

      // Fix Duration if MPD says 0 or infinity
      if (yTrack.time > 0) {
        serverStatus.duration = yTrack.time;
      }
    }
  }

  const isRadio = serverSong.file && serverSong.file.startsWith("http");
  if (isRadio && !serverSong.isYandex) {
    const clean = (str) =>
      (str || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const targetUrl = clean(serverSong.file);
    const targetTitle = clean(serverSong.title);

    const found = allStations.find((s) => {
      const sUrl = clean(
        s.station || s.file || s.url || (Array.isArray(s) ? s[1] : ""),
      );
      const sName = clean(s.name || (Array.isArray(s) ? s[0] : ""));
      return (
        (sUrl && targetUrl.includes(sUrl)) ||
        (sName && targetTitle.includes(sName))
      );
    });

    if (found) {
      serverSong.stationName = found.name || found[0];
    } else if (oldSong.stationName && oldSong.file === serverSong.file) {
      serverSong.stationName = oldSong.stationName;
    }
  }

  currentSong.set(serverSong);

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
      manageTicker(isPlaying && !isRadio);
      return serverStatus;
    }

    if (now < ignoreUpdatesUntil) return localStatus;

    if (forceHardSync) {
      forceHardSync = false;
      timeDriftSpeed = 1.0;
      manageTicker(isPlaying && !isRadio);
      return serverStatus;
    }

    if (isPlaying && !isRadio) {
      const diff = serverStatus.elapsed - localStatus.elapsed;
      if (Math.abs(diff) > 2.0) {
        timeDriftSpeed = 1.0;
        return serverStatus;
      }
      if (Math.abs(diff) < 0.05) {
        timeDriftSpeed = 1.0;
      } else {
        const timeToCorrect = 1.5;
        let correction = diff / timeToCorrect;
        timeDriftSpeed = Math.max(0.5, Math.min(1.5, 1.0 + correction));
      }
      return { ...serverStatus, elapsed: localStatus.elapsed };
    }

    manageTicker(false);
    return serverStatus;
  });
}

function manageTicker(shouldRun) {
  if (shouldRun) startTicker();
  else stopTicker();
}

function startTicker() {
  if (playbackTicker || isInitialSync) return;
  lastTickTime = performance.now();
  playbackTicker = setInterval(() => {
    const now = performance.now();
    let deltaTime = (now - lastTickTime) / 1000;
    if (deltaTime > 2.0) deltaTime = 0;
    lastTickTime = now;

    status.update((s) => {
      if (s.state !== "play") return s;
      let newElapsed = s.elapsed + deltaTime * timeDriftSpeed;
      if (s.duration > 0 && newElapsed > s.duration) newElapsed = s.duration;
      return { ...s, elapsed: newElapsed };
    });
  }, TICKER_INTERVAL);
}

function stopTicker() {
  if (playbackTicker) {
    clearInterval(playbackTicker);
    playbackTicker = null;
  }
  timeDriftSpeed = 1.0;
  lastTickTime = 0;
}

async function sendTracksInChunks(tracks, playAfter = false) {
  if (!tracks || tracks.length === 0) return;

  isQueueLocked.set(true);
  forceHardSync = true;

  const CHUNK_SIZE = 5;

  try {
    for (let i = 0; i < tracks.length; i += CHUNK_SIZE) {
      const chunk = tracks.slice(i, i + CHUNK_SIZE);
      const commands = ["command_list_begin"];

      chunk.forEach((t) => {
        commands.push(`add "${escapePath(t.file)}"`);
      });
      commands.push("command_list_end");

      await mpdClient.send(commands.join("\n"));
    }

    if (playAfter) {
      await mpdClient.send("play 0");
      showToast(`Playing ${tracks.length} tracks`, "success");
    } else {
      showToast(`Added ${tracks.length} tracks`, "success");
    }
  } catch (e) {
    console.error("[Player] Bulk Action Failed:", e);
    showToast("Error adding tracks", "error");
  } finally {
    setTimeout(() => {
      isQueueLocked.set(false);
      refreshStatus();
    }, 1500);
  }
}

export const PlayerActions = {
  async togglePlay() {
    const s = get(status);
    const isPlaying = s.state === "play";
    ignoreUpdatesUntil = performance.now() + 800;
    status.update((curr) => {
      const newState = isPlaying ? "pause" : "play";
      if (newState === "play") startTicker();
      else stopTicker();
      return { ...curr, state: newState };
    });
    await mpdClient.send(isPlaying ? "pause 1" : "play");
    setTimeout(refreshStatus, 900);
  },

  async next() {
    forceHardSync = true;
    ignoreUpdatesUntil = 0;
    await mpdClient.send("next");
    refreshStatus();
  },

  async previous() {
    forceHardSync = true;
    ignoreUpdatesUntil = 0;
    status.update((s) => ({ ...s, elapsed: 0 }));
    await mpdClient.send("previous");
    refreshStatus();
  },

  async setVolume(val) {
    status.update((s) => ({ ...s, volume: val }));
    await mpdClient.send(`setvol ${val}`);
  },

  async seek(seconds) {
    forceHardSync = true;
    ignoreUpdatesUntil = performance.now() + 500;
    status.update((s) => ({ ...s, elapsed: seconds }));
    await mpdClient.send(`seekcur ${seconds}`);
    setTimeout(refreshStatus, 600);
  },

  async toggleRandom() {
    const s = get(status);
    const newVal = !s.random;
    status.update((curr) => ({ ...curr, random: newVal }));
    await mpdClient.send(`random ${newVal ? 1 : 0}`);
  },

  async toggleRepeat() {
    const s = get(status);
    const newVal = !s.repeat;
    status.update((curr) => ({ ...curr, repeat: newVal }));
    await mpdClient.send(`repeat ${newVal ? 1 : 0}`);
  },

  async playUri(uri, meta = {}) {
    isQueueLocked.set(true);
    const safeUri = escapePath(uri);
    forceHardSync = true;

    status.update((s) => ({ ...s, state: "play", elapsed: 0 }));
    currentSong.set({
      title: meta.title || uri.split("/").pop(),
      artist: meta.artist || "",
      album: meta.album || "",
      file: uri,
    });
    startTicker();

    try {
      const songData = await mpdClient.send("currentsong");
      const currentPos = parseInt(MpdParser.parseKeyValue(songData).pos);

      const res = await mpdClient.send(`addid "${safeUri}"`);
      const newId = parseInt(MpdParser.parseKeyValue(res).id);

      if (!isNaN(newId)) {
        const targetPos = isNaN(currentPos) ? 0 : currentPos + 1;
        await mpdClient.send(`moveid ${newId} ${targetPos}`);
        await mpdClient.send(`playid ${newId}`);
      } else {
        await mpdClient.send(`add "${safeUri}"`);
        await mpdClient.send("play");
      }
    } catch (e) {
      console.error("Play error", e);
      showToast("Failed to play", "error");
    }

    setTimeout(() => {
      isQueueLocked.set(false);
      refreshStatus();
    }, 1200);
  },

  async addToQueue(uri) {
    try {
      await mpdClient.send(`add "${escapePath(uri)}"`);
      showToast("Added to queue", "success");
    } catch (e) {
      console.error("Add queue error", e);
      showToast("Failed to add", "error");
    }
  },

  async playNext(uri) {
    isQueueLocked.set(true);
    const safeUri = escapePath(uri);
    try {
      const songData = await mpdClient.send("currentsong");
      const currentPos = parseInt(MpdParser.parseKeyValue(songData).pos || -1);

      if (currentPos === -1) {
        isQueueLocked.set(false);
        await this.playUri(uri);
      } else {
        const res = await mpdClient.send(`addid "${safeUri}"`);
        const newId = parseInt(MpdParser.parseKeyValue(res).id);

        if (!isNaN(newId)) {
          await mpdClient.send(`moveid ${newId} ${currentPos + 1}`);
          showToast("Will play next", "success");
        }
        setTimeout(() => isQueueLocked.set(false), 1000);
      }
    } catch (e) {
      console.error("Play Next error", e);
      showToast("Failed to set next", "error");
      isQueueLocked.set(false);
    }
  },

  async removeFromQueue(pos) {
    isQueueLocked.set(true);
    if (queueUnlockTimer) clearTimeout(queueUnlockTimer);

    try {
      queue.update((q) => {
        const copy = [...q];
        copy.splice(pos, 1);
        return copy;
      });
      await mpdClient.send(`delete ${pos}`);
    } catch (e) {
      showToast("Failed to remove", "error");
      isQueueLocked.set(false);
      return;
    }
    queueUnlockTimer = setTimeout(() => {
      isQueueLocked.set(false);
    }, 1000);
  },

  async moveTrack(fromPos, toPos) {
    if (fromPos === toPos) return;

    isQueueLocked.set(true);
    if (queueUnlockTimer) clearTimeout(queueUnlockTimer);

    try {
      await mpdClient.send(`move ${fromPos} ${toPos}`);
    } catch (e) {
      console.error("Move failed", e);
      showToast("Move failed", "error");
      isQueueLocked.set(false);
      refreshStatus();
      return;
    }

    queueUnlockTimer = setTimeout(() => {
      isQueueLocked.set(false);
      refreshStatus();
    }, 2000);
  },

  async playAllTracks(tracks) {
    if (!tracks || tracks.length === 0) return;
    try {
      await mpdClient.send("stop");
      await mpdClient.send("clear");
      await sendTracksInChunks(tracks, true);
    } catch (e) {
      console.error(e);
    }
  },

  async addAllToQueue(tracks) {
    if (!tracks || tracks.length === 0) return;
    await sendTracksInChunks(tracks, false);
  },

  async saveQueue(name) {
    if (!name) return;
    const safeName = name.replace(/"/g, '\\"');
    try {
      await mpdClient.send(`save "${safeName}"`);
      showToast(`Playlist "${name}" saved`, "success");
    } catch (e) {
      if (e.message.includes("exist")) {
        if (confirm(`Playlist "${name}" exists. Overwrite?`)) {
          try {
            await mpdClient.send(`rm "${safeName}"`);
            await mpdClient.send(`save "${safeName}"`);
            showToast(`Playlist "${name}" overwritten`, "success");
          } catch (err) {
            showToast("Failed to overwrite", "error");
          }
        }
      } else {
        console.error(e);
      }
    }
  },
};
