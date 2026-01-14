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
    const base = isDev ? `http://${CONFIG.MOODE_IP}` : "";
    return `${base}/wave-api.php?action=stations`;
  },

  COVER_ART: (file) =>
    `${getBaseUrl()}/coverart.php?u=${encodeURIComponent(file)}`,

  RADIO_LOGOS: (filename) =>
    `${getBaseUrl()}/imagesw/radio-logos/thumbs/${filename}`,
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
