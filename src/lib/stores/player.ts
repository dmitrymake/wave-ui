// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable } from "svelte/store";
import type { Track, MpdStatus } from "../types";

// Pure artwork logic lives in lib/artwork.ts (sources/utils layer); re-exported here
// so existing call sites importing from the player store / barrel keep working.
export { getTrackCoverUrl, getTrackThumbUrl } from "../artwork";


export const status = writable<MpdStatus>({
  state: "stop",
  volume: 50,
  elapsed: 0,
  duration: 0,
  random: false,
  repeat: false,
  bitrate: 0,
  format: "",
  song: 0,
  songId: 0,
  playlistLength: 0,
  playlistVersion: 0,
});

export const currentSong = writable<Track>({
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


export const queue = writable<Track[]>([]);
export const queueVersion = writable<number>(0);
export const isQueueLocked = writable<boolean>(false);
