import { get } from "svelte/store";
import { mpdClient } from "./client";
import { PlayerActions, startStatusPoller } from "./player";
import { LibraryActions } from "./library";
import { currentSong, stations, selectedStationName } from "../store";
import { isRemoteUrl } from "../utils";
import type { Track, Station } from "../types.js";

export function connect(): void {
  mpdClient.connect();
  startStatusPoller();
  LibraryActions.loadPlaylists();
  LibraryActions.loadFavorites();
}

export function runMpdRequest(cmd: string): Promise<string> {
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
  loadPlaylists,
  openPlaylistDetails,
  createEmptyPlaylist,
  saveQueueAsPlaylist,
  toggleFavorite,
  loadFavorites,
  removeFromPlaylist,
  movePlaylistTrack,
} = LibraryActions;

export function nav(cmd: "next" | "previous"): void {
  const song = get(currentSong);
  const stationList = get(stations);
  const selStation = get(selectedStationName);
  const isRadioMode = isRemoteUrl(song.file);

  if (
    isRadioMode &&
    stationList.length > 0 &&
    !song.isYandex &&
    (cmd === "next" || cmd === "previous")
  ) {
    let currentIndex = stationList.findIndex((s: Station) => s.name === selStation);
    if (currentIndex === -1) currentIndex = 0;

    let nextIndex: number;
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

export function playStation(station: Station | null): void {
  if (!station) return;

  selectedStationName.set(station.name);
  const streamUrl =
    station.station ||
    station.file ||
    station.url;
  if (!streamUrl) return;

  PlayerActions.playUri(streamUrl, {
    title: station.name,
    artist: station.genre || "Radio Stream",
    stationName: station.name,
  });
}

export function playTrackOptimistic(track: Track | null): void {
  if (!track) return;
  selectedStationName.set(null);
  PlayerActions.playUri(track.file, {
    title: track.title,
    artist: track.artist,
    album: track.album,
    stationName: null,
  });
}
