import { writable, derived, get } from "svelte/store";
import { CONFIG } from "../config";
import { getStationImageUrl } from "./utils";
import md5 from "md5";

export const connectionStatus = writable("Disconnected");

export const toastMessage = writable(null);
let toastTimer;

export function showToast(msg, type = "info") {
  toastMessage.set({ text: msg, type });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.set(null);
  }, 3000);
}

export const status = writable({
  state: "stop",
  volume: 50,
  elapsed: 0,
  duration: 0,
  random: false,
  repeat: false,
  bitrate: 0,
  format: "",
});

export const currentSong = writable({
  title: "Not Playing",
  artist: "",
  album: "",
  file: "",
  stationName: null,
});

// UI
export const isFullPlayerOpen = writable(false);
export const isLoadingRadio = writable(false);
export const isLoadingPlaylists = writable(false);
export const isLoadingTracks = writable(false);
export const activeMenuTab = writable("library");
export const selectedStationName = writable(null);
export const isSyncingLibrary = writable(false);

// Library
export const stations = writable([]);
export const playlists = writable([]);
export const activePlaylistTracks = writable([]);
export const activePlaylistName = writable(null);
export const favorites = writable(new Set());
export const isQueueLocked = writable(false);

// Navigation
export const navigationStack = writable([{ view: "root" }]);
export const queue = writable([]);
export const queueVersion = writable(0);
export const searchQuery = writable("");

// Scroll
export const scrollPositions = writable({});
export function saveScrollPosition(key, pos) {
  scrollPositions.update((s) => ({ ...s, [key]: pos }));
}
export function getScrollPosition(key) {
  return get(scrollPositions)[key] || 0;
}

export const contextMenu = writable({
  isOpen: false,
  track: null,
  context: { type: "general", playlistName: null, index: null },
  x: 0,
  y: 0,
  triggerRect: null,
});

export const playlistSelector = writable({
  isOpen: false,
  track: null,
});

function vibrate() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(70);
    } catch (e) {
      // ignore
    }
  }
}

export function openContextMenu(e, track, contextData = {}) {
  if (!track) return;
  vibrate();

  let clientX = 0;
  let clientY = 0;
  let rect = null;

  let el = e.currentTarget;
  if (!el && e.target && e.target.closest) {
    el = e.target.closest("button") || e.target;
  }

  if (el && el.getBoundingClientRect) {
    rect = el.getBoundingClientRect();
  }

  const evt = e.detail?.originalEvent || e;
  if (evt.touches && evt.touches.length > 0) {
    clientX = evt.touches[0].clientX;
    clientY = evt.touches[0].clientY;
  } else if (evt.clientX) {
    clientX = evt.clientX;
    clientY = evt.clientY;
  }

  const ctx = {
    type: "general",
    playlistName: null,
    index: null,
    ...contextData,
  };

  contextMenu.set({
    isOpen: true,
    track,
    context: ctx,
    x: clientX,
    y: clientY,
    triggerRect: rect,
  });
}

export function closeContextMenu() {
  contextMenu.set({
    isOpen: false,
    track: null,
    context: {},
    x: 0,
    y: 0,
    triggerRect: null,
  });
}

export function openPlaylistSelector(track) {
  closeContextMenu();
  playlistSelector.set({ isOpen: true, track });
}

export function closePlaylistSelector() {
  playlistSelector.set({ isOpen: false, track: null });
}

// Routing
let pendingRouteData = null;
let onNavigateCallback = null;

export function setNavigationCallback(fn) {
  onNavigateCallback = fn;
}

export function navigateTo(view, data = null) {
  if (data) pendingRouteData = data;

  if (onNavigateCallback) {
    onNavigateCallback(view, data);
  } else {
    console.warn("Router callback not set!");
  }
}

export function consumeRouteData() {
  const d = pendingRouteData;
  pendingRouteData = null;
  return d;
}

export function navigateBack() {
  window.history.back();
}

export function handleBrowserBack() {
  // Placeholder
}

// FULL SIZE (for player)
export function getTrackCoverUrl(
  track,
  stationList = [],
  selectedRadioName = null,
) {
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

  let cleanPath = track.file.startsWith("/") ? track.file.slice(1) : track.file;
  return `/coverart.php/${encodeURI(cleanPath)}`;
}

export function getTrackThumbUrl(
  track,
  size = "sm",
  stationList = [],
  selectedRadioName = null,
) {
  // Handle Radio
  if (
    !track ||
    (track.file &&
      (isRadioTrack(track.file) ||
        track.genre === "Radio" ||
        Array.isArray(track)))
  ) {
    if (track && track.image) {
      return getStationImageUrl(track);
    }
    return (
      resolveRadioImage(track, stationList, selectedRadioName) ||
      "/images/radio_icon.png"
    );
  }

  if (!track.file) return "/images/default_icon.png";

  // New Logic: Use thumbHash if available
  if (track.thumbHash) {
    const suffix = size === "md" ? "" : "_sm";
    return `/imagesw/thmcache/${track.thumbHash}${suffix}.jpg`;
  }

  // Fallback for legacy DB or uncached items
  try {
    const lastSlashIndex = track.file.lastIndexOf("/");
    const dirPath =
      lastSlashIndex === -1 ? "." : track.file.substring(0, lastSlashIndex);
    const hash = md5(dirPath);
    const suffix = size === "md" ? "" : "_sm";
    return `/imagesw/thmcache/${hash}${suffix}.jpg`;
  } catch (e) {
    let cleanPath = track.file.startsWith("/")
      ? track.file.slice(1)
      : track.file;
    return `/coverart.php/${encodeURI(cleanPath)}`;
  }
}

function isRadioTrack(file) {
  if (!file) return false;
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

export const currentCover = derived(
  [currentSong, stations, selectedStationName],
  ([$song, $stations, $selectedName]) => {
    return getTrackCoverUrl($song, $stations, $selectedName);
  },
);

export const currentArtistImage = derived(currentSong, ($song) => {
  if (!$song || !$song.file) return null;
  if ($song.file.startsWith("http")) return null;
  return `/coverart.php/${encodeURI($song.file)}`;
});

export const coverUrl = currentCover;
