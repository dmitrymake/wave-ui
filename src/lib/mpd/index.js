import { get } from "svelte/store";
import { mpdClient } from "./client";
import { PlayerActions, startStatusPoller } from "./player";
import { LibraryActions } from "./library";
import {
  currentSong,
  stations,
  selectedStationName,
  status,
  yandexContext,
  showToast,
} from "../store";
import { YandexApi } from "../yandex";

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

  // YANDEX NEXT LOGIC
  if (
    yCtx.active &&
    yCtx.tracks.length > 0 &&
    (song.isYandex || (song.file && song.file === yCtx.currentTrackFile))
  ) {
    let nextIndex;
    if (cmd === "next") {
      nextIndex = yCtx.currentIndex + 1;
      if (nextIndex >= yCtx.tracks.length) nextIndex = 0; // Loop or stop
    } else {
      nextIndex = yCtx.currentIndex - 1;
      if (nextIndex < 0) nextIndex = yCtx.tracks.length - 1;
    }

    const nextTrack = yCtx.tracks[nextIndex];
    if (nextTrack) {
      resolveAndQueueYandexTrack(nextTrack, nextIndex, true);
      return;
    }
  }

  // RADIO NEXT LOGIC
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
    // STANDARD MPD NEXT
    if (cmd === "next") PlayerActions.next();
    if (cmd === "previous") PlayerActions.previous();
  }
}

export function playStation(station) {
  if (!station) return;
  // Disable Yandex context on radio play
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

// HELPER FOR YANDEX PLAYBACK
async function resolveAndQueueYandexTrack(
  track,
  index,
  playImmediately = true,
) {
  if (!track.id) return;

  if (playImmediately) {
    showToast(`Resolving ${track.title}...`, "info");
  }

  try {
    const streamUrl = await YandexApi.getStreamUrl(track.id);
    if (!streamUrl) throw new Error("No Stream");

    // Update Context
    yandexContext.update((ctx) => ({
      ...ctx,
      active: true,
      currentIndex: index,
      currentTrackId: track.id,
      currentTrackFile: streamUrl,
    }));

    if (playImmediately) {
      await PlayerActions.playUri(streamUrl, {
        title: track.title,
        artist: track.artist,
        album: track.album,
      });

      // Prefetch next tracks to ensure continuous playback
      prefetchNextYandexTracks(index + 1);
    } else {
      await PlayerActions.addToQueue(streamUrl);
    }
  } catch (e) {
    showToast("Failed to play Yandex track", "error");
  }
}

async function prefetchNextYandexTracks(startIndex) {
  const yCtx = get(yandexContext);
  if (!yCtx.active || !yCtx.tracks) return;

  const BATCH_SIZE = 3; // Number of tracks to buffer ahead
  const tracksToQueue = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    const idx = startIndex + i;
    if (idx < yCtx.tracks.length) {
      tracksToQueue.push(yCtx.tracks[idx]);
    }
  }

  if (tracksToQueue.length === 0) return;

  // Add tracks to MPD queue without playing them
  for (const track of tracksToQueue) {
    try {
      const url = await YandexApi.getStreamUrl(track.id);
      if (url) {
        await mpdClient.send(`add "${url}"`);
      }
    } catch (e) {
      console.warn("Failed to prefetch", track.title);
    }
  }
}

export async function playYandexContext(tracks, startIndex = 0) {
  if (!tracks || tracks.length === 0) return;

  // Initialize context
  yandexContext.set({
    active: true,
    tracks: tracks,
    currentIndex: startIndex,
    currentTrackFile: null,
    currentTrackId: tracks[startIndex].id,
  });

  // Clear current queue to start fresh
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
