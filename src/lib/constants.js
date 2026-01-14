import { CONFIG } from "../config";

const getBaseUrl = () => {
  const isDev = import.meta.env.DEV;
  if (isDev) {
    return `http://${CONFIG.MOODE_IP}`;
  }
  return "";
};

export const DATABASE = {
  NAME: "MoodePlayerDB",
  STORE_NAME: "music",
  VERSION: 3,
};

export const API_ENDPOINTS = {
  get SYNC() {
    return `${getBaseUrl()}/wave-api.php`;
  },
  get YANDEX() {
    return `${getBaseUrl()}/wave-yandex-api.php`;
  },

  STATIONS: (isDev) => {
    return `${getBaseUrl()}/wave-api.php?action=stations`;
  },

  // Moode cover art script usually accepts path info
  COVER_ART: (path) => {
    let clean = path;
    if (clean.startsWith("/")) clean = clean.slice(1);
    return `${getBaseUrl()}/coverart.php/${encodeURI(clean)}`;
  },

  // Thumbnail cache direct access
  THUMB_CACHE: (hash, size = "sm") => {
    const suffix = size === "md" ? "" : "_sm";
    return `${getBaseUrl()}/imagesw/thmcache/${hash}${suffix}.jpg`;
  },

  // Radio logos
  RADIO_LOGOS: (filename) => {
    return `${getBaseUrl()}/imagesw/radio-logos/thumbs/${encodeURIComponent(filename)}`;
  },

  // Default images (served from local public folder, so no BaseUrl needed usually,
  // UNLESS you want to serve them from the Pi, but typically these are in your Vite public dir)
  // We'll keep them relative for now as they are likely part of the UI build.
};

export const PLAYER_CONFIG = {
  POLLER_INTERVAL: 1000,
  TICKER_INTERVAL: 250,
  UI_LOCK_SHORT: 500,
  UI_LOCK_LONG: 800,
  UI_LOCK_SYNC: 1000,
  RECONNECT_DELAY: 3000,
  WATCHDOG_TIMEOUT: 5000,
};

export const FAVORITES_PLAYLIST = "Favorites";
