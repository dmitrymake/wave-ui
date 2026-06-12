// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable, derived } from "svelte/store";
import { stations, selectedStationName } from "./library";
import { getStationImageUrl, isRemoteUrl, findStationByName } from "../utils";
import { resolveSource } from "../sources/trackSource";
import { API_ENDPOINTS } from "../constants";
import md5 from "md5";
import type { Track, MpdStatus, Station } from "../types";


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
  isYandex: false,
});


export const queue = writable<Track[]>([]);
export const queueVersion = writable<number>(0);
export const isQueueLocked = writable<boolean>(false);


function isRadioTrack(file: string): boolean {
  if (!file) return false;
  // A track owned by a streaming source (e.g. Yandex) is not internet radio.
  if (resolveSource(file)) return false;
  return isRemoteUrl(file) || file.includes("RADIO");
}

function resolveRadioImage(
  track: Track | null,
  stationList: Station[],
  selectedRadioName: string | null,
): string | null {
  if (stationList && stationList.length > 0) {
    const found = findStationByName(stationList, track?.title, track?.stationName, selectedRadioName);
    if (found) return getStationImageUrl(found);
  }
  const fallbackName = track?.stationName || selectedRadioName;
  if (fallbackName) {
    return getStationImageUrl({ name: fallbackName, image: "local" });
  }
  return null;
}

// Artwork resolution shared by cover and thumb: a remote image/cover URL, or a
// radio-station image (with the caller's placeholder). Returns null for a normal
// library file so the caller can pick cover-art vs thumb-cache.
function resolveSharedArtwork(
  track: Track | null,
  radioPlaceholder: string,
  stationList: Station[],
  selectedRadioName: string | null,
): string | null {
  if (!track) return null;
  if (isRemoteUrl(track.image)) return track.image!;
  if (isRemoteUrl(track.cover)) return track.cover!;

  if (track.file && (isRadioTrack(track.file) || track.genre === "Radio")) {
    if (track.image) {
      return (
        getStationImageUrl({
          name: track.stationName || track.title,
          image: track.image!,
        } as Pick<Station, "name" | "image">) || radioPlaceholder
      );
    }
    return resolveRadioImage(track, stationList, selectedRadioName) || radioPlaceholder;
  }

  return null;
}

export function getTrackCoverUrl(
  track: Track | null,
  stationList: Station[] = [],
  selectedRadioName: string | null = null,
): string {
  const shared = resolveSharedArtwork(track, "/images/radio_placeholder.png", stationList, selectedRadioName);
  if (shared) return shared;

  if (!track || !track.file) return "/images/default_cover.png";

  return API_ENDPOINTS.COVER_ART(track.file);
}

export function getTrackThumbUrl(
  track: Track | null,
  size: "sm" | "md" = "sm",
  stationList: Station[] = [],
  selectedRadioName: string | null = null,
): string {
  if (!track) return "/images/default_icon.png";

  const shared = resolveSharedArtwork(track, "/images/radio_icon.png", stationList, selectedRadioName);
  if (shared) return shared;

  if (!track.file) return "/images/default_icon.png";

  if (track.thumbHash) {
    return API_ENDPOINTS.THUMB_CACHE(track.thumbHash, size);
  }

  try {
    const lastSlashIndex = track.file.lastIndexOf("/");
    const dirPath =
      lastSlashIndex === -1 ? "." : track.file.substring(0, lastSlashIndex);
    const hash = md5(dirPath);
    return API_ENDPOINTS.THUMB_CACHE(hash, size);
  } catch (e) {
    return API_ENDPOINTS.COVER_ART(track.file);
  }
}


export const currentCover = derived(
  [currentSong, stations, selectedStationName],
  ([$song, $stations, $selectedName]) => {
    return getTrackCoverUrl($song, $stations, $selectedName);
  },
);

// Per-file album cover for the current local track (null for remote streams).
export const currentAlbumCover = derived(currentSong, ($song): string | null => {
  if (!$song || !$song.file) return null;
  if (isRemoteUrl($song.file)) return null;
  return API_ENDPOINTS.COVER_ART($song.file);
});

export const coverUrl = currentCover;
