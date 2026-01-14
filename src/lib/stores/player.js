import { writable, derived, get } from "svelte/store";
import { stations, selectedStationName } from "./library";
import { getStationImageUrl } from "../utils";
import { API_ENDPOINTS } from "../constants";
import md5 from "md5";

// --- MPD STATUS ---
export const status = writable({
  state: "stop",
  volume: 50,
  elapsed: 0,
  duration: 0,
  random: false,
  repeat: false,
  bitrate: 0,
  format: "",
  song: 0,
  songid: 0,
});

export const currentSong = writable({
  title: "Not Playing",
  artist: "",
  album: "",
  file: "",
  stationName: null,
  id: null,
  pos: null,
  isYandex: false,
});

// --- QUEUE ---
export const queue = writable([]);
export const queueVersion = writable(0);
export const isQueueLocked = writable(false);

// --- ARTWORK HELPERS ---
function isRadioTrack(file) {
  if (!file) return false;
  if (file.includes("yandex.net") || file.includes("get-mp3")) return false;
  return (
    file.startsWith("http") || file.includes("://") || file.includes("RADIO")
  );
}

function resolveRadioImage(track, stationList, selectedRadioName) {
  const normalize = (str) =>
    (str || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const targetTitle = normalize(track?.title);
  const targetStationName = normalize(track?.stationName);
  const targetSelected = normalize(selectedRadioName);

  if (stationList && stationList.length > 0) {
    const found = stationList.find((s) => {
      const sName = normalize(s.name);
      if (!sName) return false;
      return (
        sName === targetStationName ||
        sName === targetSelected ||
        (targetTitle && sName === targetTitle) ||
        (targetTitle && targetTitle.includes(sName) && sName.length > 3)
      );
    });
    if (found) return getStationImageUrl(found);
  }

  const fallbackName = track?.stationName || selectedRadioName;
  if (fallbackName) {
    return getStationImageUrl({ name: fallbackName, image: "local" });
  }
  return null;
}

export function getTrackCoverUrl(
  track,
  stationList = [],
  selectedRadioName = null,
) {
  if (track && track.image && track.image.startsWith("http")) {
    return track.image;
  }
  if (track && track.cover && track.cover.startsWith("http")) {
    return track.cover;
  }

  if (!track || !track.file) return "/images/default_cover.png";

  if (isRadioTrack(track.file) || track.genre === "Radio") {
    if (track.image) {
      return getStationImageUrl(track);
    }
    return (
      resolveRadioImage(track, stationList, selectedRadioName) ||
      "/images/radio_placeholder.png"
    );
  }

  return API_ENDPOINTS.COVER_ART(track.file);
}

export function getTrackThumbUrl(
  track,
  size = "sm",
  stationList = [],
  selectedRadioName = null,
) {
  if (!track) return "/images/default_icon.png";

  if (track.image && track.image.startsWith("http")) {
    return track.image;
  }
  if (track.cover && track.cover.startsWith("http")) {
    return track.cover;
  }

  if (
    track.file &&
    (isRadioTrack(track.file) ||
      track.genre === "Radio" ||
      Array.isArray(track))
  ) {
    if (track.image) {
      return getStationImageUrl(track);
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
    // Fallback to on-the-fly generation if hash fails
    return API_ENDPOINTS.COVER_ART(track.file);
  }
}

// --- DERIVED STORES ---
export const currentCover = derived(
  [currentSong, stations, selectedStationName],
  ([$song, $stations, $selectedName]) => {
    return getTrackCoverUrl($song, $stations, $selectedName);
  },
);

export const currentArtistImage = derived(currentSong, ($song) => {
  if (!$song || !$song.file) return null;
  if ($song.file.startsWith("http")) return null;
  return API_ENDPOINTS.COVER_ART($song.file);
});

export const coverUrl = currentCover;
