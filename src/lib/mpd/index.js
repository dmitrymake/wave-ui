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
      playYandexTrack(nextTrack, nextIndex);
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
export async function playYandexTrack(track, index) {
  if (!track.id) return;
  showToast(`Resolving ${track.title}...`, "info");

  try {
    const streamUrl = await YandexApi.getStreamUrl(track.id);
    if (!streamUrl) throw new Error("No Stream");

    // Update Context
    yandexContext.update((ctx) => ({
      ...ctx,
      active: true,
      currentIndex: index,
      currentTrackFile: streamUrl,
    }));

    PlayerActions.playUri(streamUrl, {
      title: track.title,
      artist: track.artist,
      album: track.album,
    });
  } catch (e) {
    showToast("Failed to play Yandex track", "error");
  }
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
