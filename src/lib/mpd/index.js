import { get } from "svelte/store";
import { mpdClient } from "./client";
import { PlayerActions, startStatusPoller } from "./player";
import { LibraryActions } from "./library";
import { currentSong, stations, selectedStationName, status } from "../store";

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

  if (
    isRadioMode &&
    stationList.length > 0 &&
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
  selectedStationName.set(null);
  PlayerActions.playUri(track.file, {
    title: track.title,
    artist: track.artist,
    album: track.album,
    stationName: null,
  });
}

export async function playPlaylistContext(playlistName, index = 0) {
  if (!playlistName) return;
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
