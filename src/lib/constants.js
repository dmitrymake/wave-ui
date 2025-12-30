import { CONFIG } from "../config";

export const DATABASE = {
  NAME: "MoodePlayerDB",
  STORE_NAME: "music",
  VERSION: 2,
};

export const API_ENDPOINTS = {
  SYNC: `/wave-api.php`,

  STATIONS: (isDev) => `/wave-api.php?action=stations`,

  COVER_ART: (file) => `/coverart.php?u=${encodeURIComponent(file)}`,

  RADIO_LOGOS: (filename) => `/imagesw/radio-logos/thumbs/${filename}`,
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
