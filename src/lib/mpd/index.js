import { get } from "svelte/store";
import { mpdClient } from "./client";
import { PlayerActions, startStatusPoller } from "./player";
import { LibraryActions } from "./library";
import { MpdParser } from "./parser";
import {
  currentSong,
  stations,
  selectedStationName,
  status,
  yandexContext,
  showToast,
  queue,
} from "../store";
import { YandexApi } from "../yandex";
import { ApiActions } from "../api"; // Импортируем ApiActions

export function connect() {
  mpdClient.connect();
  startStatusPoller();
  LibraryActions.loadPlaylists();
  LibraryActions.loadFavorites();
}

export function runMpdRequest(cmd) {
  return mpdClient.send(cmd);
}

export const {
  togglePlay,
  toggleRandom,
  toggleRepeat,
  setVolume,
  seek,
  addToQueue,
  playNext,
  removeFromQueue,
  moveTrack,
  saveQueue,
  playAllTracks,
  addAllToQueue,
  playUri,
} = PlayerActions;

export const {
  syncLibrary,
  loadRadioStations,
  loadPlaylists,
  openPlaylistDetails,
  toggleFavorite,
  loadFavorites,
  removeFromPlaylist,
  movePlaylistTrack,
} = LibraryActions;

export function nav(cmd) {
  const song = get(currentSong);
  const stationList = get(stations);
  const selStation = get(selectedStationName);
  const isRadioMode = song.file && song.file.startsWith("http");
  const yCtx = get(yandexContext);
  const playerStatus = get(status);

  if (
    yCtx.active &&
    yCtx.tracks.length > 0 &&
    (song.isYandex || (song.file && song.file === yCtx.currentTrackFile))
  ) {
    let nextIndex;

    if (cmd === "next") {
      if (playerStatus.random) {
        let attempts = 0;
        do {
          nextIndex = Math.floor(Math.random() * yCtx.tracks.length);
          attempts++;
        } while (
          nextIndex === yCtx.currentIndex &&
          attempts < 5 &&
          yCtx.tracks.length > 1
        );
      } else {
        nextIndex = yCtx.currentIndex + 1;
      }

      if (nextIndex >= yCtx.tracks.length) {
        const lastTrack = yCtx.tracks[yCtx.tracks.length - 1];
        if (lastTrack && lastTrack.id) {
          showToast("Playlist ended. Starting My Vibe...", "info");
          startYandexRadio(lastTrack.id);
        } else {
          resolveAndQueueYandexTrack(yCtx.tracks[0], 0, true);
        }
        return;
      }
    } else {
      if (playerStatus.random) {
        nextIndex = Math.floor(Math.random() * yCtx.tracks.length);
      } else {
        nextIndex = yCtx.currentIndex - 1;
        if (nextIndex < 0) nextIndex = yCtx.tracks.length - 1;
      }
    }

    const nextTrack = yCtx.tracks[nextIndex];
    if (nextTrack) {
      resolveAndQueueYandexTrack(nextTrack, nextIndex, true);
      return;
    }
  }

  if (
    isRadioMode &&
    stationList.length > 0 &&
    !song.isYandex &&
    (cmd === "next" || cmd === "previous")
  ) {
    let currentIndex = stationList.findIndex((s) => s.name === selStation);
    if (currentIndex === -1) currentIndex = 0;

    let nextIndex;
    if (cmd === "next") {
      nextIndex = currentIndex + 1;
      if (nextIndex >= stationList.length) nextIndex = 0;
    } else {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) nextIndex = stationList.length - 1;
    }
    playStation(stationList[nextIndex]);
  } else {
    if (cmd === "next") PlayerActions.next();
    if (cmd === "previous") PlayerActions.previous();
  }
}

export function playStation(station) {
  if (!station) return;
  yandexContext.update((ctx) => ({ ...ctx, active: false }));

  selectedStationName.set(station.name);
  const streamUrl =
    station[1] || station.station || station.file || station.url;
  if (!streamUrl) return;

  PlayerActions.playUri(streamUrl, {
    title: station.name,
    artist: station.genre || "Radio Stream",
    stationName: station.name,
  });
}

export function playTrackOptimistic(track) {
  if (!track) return;
  yandexContext.update((ctx) => ({ ...ctx, active: false }));
  selectedStationName.set(null);
  PlayerActions.playUri(track.file, {
    title: track.title,
    artist: track.artist,
    album: track.album,
    stationName: null,
  });
}

async function resolveAndQueueYandexTrack(
  track,
  index,
  playImmediately = true,
) {
  if (!track.id) return;

  try {
    let streamUrl = null;
    const yCtx = get(yandexContext);
    const existingCacheItem = Object.values(yCtx.streamCache).find(
      (item) => String(item.id) === String(track.id),
    );

    if (existingCacheItem && existingCacheItem.file) {
      streamUrl = existingCacheItem.file;
    } else {
      streamUrl = await YandexApi.getStreamUrl(track.id);
    }

    if (!streamUrl) throw new Error("No Stream");

    // SAVE TO SERVER RAM (Background)
    const meta = {
      title: track.title,
      artist: track.artist,
      album: track.album,
      image: track.image,
      id: track.id,
      time: track.time,
    };
    ApiActions.saveYandexMeta(streamUrl, meta);

    yandexContext.update((ctx) => {
      const newCache = { ...ctx.streamCache };
      newCache[streamUrl] = {
        ...track,
        isYandex: true,
        file: streamUrl,
      };

      return {
        ...ctx,
        active: true,
        currentIndex: index,
        currentTrackId: track.id,
        currentTrackFile: streamUrl,
        streamCache: newCache,
      };
    });

    if (playImmediately) {
      try {
        const safeUrl = streamUrl.replace(/"/g, '\\"');
        const findRes = await mpdClient.send(`playlistfind file "${safeUrl}"`);
        const findData = MpdParser.parseKeyValue(findRes);

        if (findData && findData.id) {
          await mpdClient.send(`playid ${findData.id}`);
        } else {
          await PlayerActions.playUri(streamUrl, {
            title: track.title,
            artist: track.artist,
            album: track.album,
          });
        }

        prefetchNextYandexTracks(index + 1);
      } catch (err) {
        console.error("Play error, falling back to playUri", err);
        await PlayerActions.playUri(streamUrl, {
          title: track.title,
          artist: track.artist,
          album: track.album,
        });
      }
    } else {
      const currentQueue = get(queue);
      const isAlreadyInQueue = currentQueue.some((q) => q.file === streamUrl);

      if (!isAlreadyInQueue) {
        await PlayerActions.addToQueue(streamUrl);
      }
    }
  } catch (e) {
    showToast("Failed to play Yandex track", "error");
    console.error(e);
  }
}

async function prefetchNextYandexTracks(startIndex) {
  const yCtx = get(yandexContext);
  if (!yCtx.active || !yCtx.tracks) return;

  const BATCH_SIZE = 3;
  const tracksToProcess = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    const idx = startIndex + i;
    if (idx < yCtx.tracks.length) {
      tracksToProcess.push(yCtx.tracks[idx]);
    }
  }

  if (tracksToProcess.length === 0) return;

  const currentQueue = get(queue);
  const queueFiles = new Set(currentQueue.map((t) => t.file));

  for (const track of tracksToProcess) {
    try {
      let url = null;

      const cachedKey = Object.keys(yCtx.streamCache).find(
        (key) => String(yCtx.streamCache[key].id) === String(track.id),
      );

      if (cachedKey) {
        url = cachedKey;
      } else {
        url = await YandexApi.getStreamUrl(track.id);
      }

      if (url) {
        // SAVE PREFETCH TO SERVER RAM
        ApiActions.saveYandexMeta(url, {
          title: track.title,
          artist: track.artist,
          album: track.album,
          image: track.image,
          id: track.id,
          time: track.time,
        });

        yandexContext.update((ctx) => {
          const newCache = { ...ctx.streamCache };
          newCache[url] = { ...track, isYandex: true, file: url };
          return { ...ctx, streamCache: newCache };
        });

        if (!queueFiles.has(url)) {
          await mpdClient.send(`add "${url}"`);
          queueFiles.add(url);
        }
      }
    } catch (e) {
      console.warn("Failed to prefetch", track.title);
    }
  }
}

export async function playYandexContext(tracks, startIndex = 0) {
  if (!tracks || tracks.length === 0) return;

  yandexContext.set({
    active: true,
    tracks: tracks,
    currentIndex: startIndex,
    currentTrackFile: null,
    currentTrackId: tracks[startIndex].id,
    streamCache: {},
  });

  await mpdClient.send("stop");
  await mpdClient.send("clear");

  const startTrack = tracks[startIndex];
  resolveAndQueueYandexTrack(startTrack, startIndex, true);
}

export async function playPlaylistContext(playlistName, index = 0) {
  if (!playlistName) return;
  yandexContext.update((ctx) => ({ ...ctx, active: false }));
  selectedStationName.set(null);
  const safeName = playlistName.replace(/"/g, '\\"');
  try {
    await mpdClient.send("stop");
    await mpdClient.send("clear");
    await mpdClient.send(`load "${safeName}"`);
    await mpdClient.send(`play ${index}`);
  } catch (e) {
    console.error("Failed to play playlist context", e);
  }
}

export async function startYandexRadio(trackId) {
  showToast("Starting My Vibe...", "info");
  try {
    const tracks = await YandexApi.getSimilarTracks(trackId);
    if (tracks.length > 0) {
      playYandexContext(tracks, 0);
    } else {
      showToast("No similar tracks found", "error");
    }
  } catch (e) {
    showToast("Radio error", "error");
  }
}
