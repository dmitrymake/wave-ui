import { writable, derived, get } from "svelte/store";
import { stations, selectedStationName } from "./library";
import { getStationImageUrl, isRemoteUrl, findStationByName } from "../utils";
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
  if (file.includes("yandex.net") || file.includes("get-mp3") || file.includes("/dev/shm/yandex_music/tracks/")) return false;
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

export function getTrackCoverUrl(
  track: Track | null,
  stationList: Station[] = [],
  selectedRadioName: string | null = null,
): string {
  if (track && isRemoteUrl(track.image)) {
    return track.image!;
  }
  if (track && isRemoteUrl(track.cover)) {
    return track.cover!;
  }

  if (!track || !track.file) return "/images/default_cover.png";

  if (isRadioTrack(track.file) || track.genre === "Radio") {
    if (track.image) {
      return getStationImageUrl({ name: track.stationName || track.title, image: track.image! } as Pick<Station, "name" | "image">) || "/images/radio_placeholder.png";
    }
    return (
      resolveRadioImage(track, stationList, selectedRadioName) ||
      "/images/radio_placeholder.png"
    );
  }

  return API_ENDPOINTS.COVER_ART(track.file);
}

export function getTrackThumbUrl(
  track: Track | null,
  size: "sm" | "md" = "sm",
  stationList: Station[] = [],
  selectedRadioName: string | null = null,
): string {
  if (!track) return "/images/default_icon.png";

  if (isRemoteUrl(track.image)) {
    return track.image!;
  }
  if (isRemoteUrl(track.cover)) {
    return track.cover!;
  }

  if (
    track.file &&
    (isRadioTrack(track.file) ||
      track.genre === "Radio")
  ) {
    if (track.image) {
      return getStationImageUrl({ name: track.stationName || track.title, image: track.image! } as Pick<Station, "name" | "image">) || "/images/radio_icon.png";
    }
    return (
      resolveRadioImage(track, stationList, selectedRadioName) ||
      "/images/radio_icon.png"
    );
  }

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

export const currentArtistImage = derived(currentSong, ($song): string | null => {
  if (!$song || !$song.file) return null;
  if (isRemoteUrl($song.file)) return null;
  return API_ENDPOINTS.COVER_ART($song.file);
});

export const coverUrl = currentCover;
