// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { CONFIG } from "../config";

const getBaseUrl = (): string => {
  const isDev = import.meta.env.DEV;

  if (isDev) {
    return `http://${CONFIG.MOODE_IP}`;
  }

  if (typeof window !== "undefined" && window.location.port === "3000") {
    return `http://${window.location.hostname}`;
  }

  return "";
};

export const DATABASE = {
  NAME: "MoodePlayerDB",
  STORE_NAME: "music",
  VERSION: 4,
} as const;

export const API_ENDPOINTS = {
  get SYNC(): string {
    return `${getBaseUrl()}/wave-api.php`;
  },

  STATIONS: (_isDev: boolean): string => {
    return `${getBaseUrl()}/wave-api.php?action=stations`;
  },

  COVER_ART: (path: string): string => {
    let clean = path;
    if (clean.startsWith("/")) clean = clean.slice(1);
    return `${getBaseUrl()}/coverart.php/${encodeURI(clean)}`;
  },

  THUMB_CACHE: (hash: string, size: "sm" | "md" = "sm"): string => {
    const suffix = size === "md" ? "" : "_sm";
    return `${getBaseUrl()}/imagesw/thmcache/${hash}${suffix}.jpg`;
  },

  RADIO_LOGOS: (filename: string): string => {
    return `${getBaseUrl()}/imagesw/radio-logos/thumbs/${encodeURIComponent(filename)}`;
  },
};

export const PLAYER_CONFIG = {
  POLLER_INTERVAL: 1000,
  TICKER_INTERVAL: 250,
  UI_LOCK_SHORT: 500,
  UI_LOCK_LONG: 800,
  UI_LOCK_SYNC: 1000,
  RECONNECT_DELAY: 3000,
  WATCHDOG_TIMEOUT: 5000,
  SYNC_WORKER_TIMEOUT: 120_000,
} as const;
