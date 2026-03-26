// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { get } from "svelte/store";
import { API_ENDPOINTS, PLAYER_CONFIG } from "./constants";
import {
  isSyncingLibrary,
  showToast,
  isLoadingRadio,
  stations,
  yandexAuthStatus,
  yandexFavorites,
} from "./store";
import SyncWorker from "./workers/sync.worker.js?worker";
import { YandexApi } from "./yandex";
import { MSG } from "./messages";
import { logger } from "./logger";
import { isRemoteUrl } from "./utils";
import type { Station } from "./types.js";

interface SyncWorkerMessage {
  type: "PROGRESS" | "DONE" | "ERROR";
  status?: string;
  count?: number;
  message?: string;
}

export const ApiActions = {
  async syncLibrary(): Promise<void> {
    if (get(isSyncingLibrary)) return;

    isSyncingLibrary.set(true);
    const worker = new SyncWorker();

    let apiUrl = API_ENDPOINTS.SYNC;
    if (!isRemoteUrl(apiUrl)) {
      if (window.location.port === "3000") {
        apiUrl = `http://${window.location.hostname}${apiUrl}`;
      } else {
        apiUrl = window.location.origin + apiUrl;
      }
    }

    worker.postMessage({
      type: "START_SYNC",
      payload: {
        url: apiUrl,
      },
    });

    const watchdog = setTimeout(() => {
      logger.error("[API] Sync worker timed out");
      showToast(MSG.SYNC_FAILED, "error");
      isSyncingLibrary.set(false);
      worker.terminate();
    }, PLAYER_CONFIG.SYNC_WORKER_TIMEOUT);

    worker.onmessage = (e: MessageEvent<SyncWorkerMessage>): void => {
      const { type, status, count, message } = e.data;

      if (type === "PROGRESS") {
        const labels: Record<string, string> = {
          connecting: MSG.SYNC_REQUESTING,
          downloading: MSG.SYNC_DOWNLOADING,
          parsing: MSG.SYNC_PROCESSING,
          saving: MSG.syncSaving(count ?? 0),
        };
        if (status && labels[status]) showToast(labels[status], "info");
      }

      if (type === "DONE") {
        clearTimeout(watchdog);
        showToast(MSG.libraryUpdated(count ?? 0), "success");
        isSyncingLibrary.set(false);
        worker.terminate();
      }

      if (type === "ERROR") {
        clearTimeout(watchdog);
        logger.error("[API] Sync Error:", message);
        showToast(MSG.syncFailed(message ?? ""), "error");
        isSyncingLibrary.set(false);
        worker.terminate();
      }
    };

    worker.onerror = (err: ErrorEvent): void => {
      clearTimeout(watchdog);
      logger.error("[API] Worker crash:", err);
      showToast(MSG.SYNC_WORKER_CRASHED, "error");
      isSyncingLibrary.set(false);
      worker.terminate();
    };
  },

  async loadRadioStations(): Promise<void> {
    if (get(isLoadingRadio)) return;

    isLoadingRadio.set(true);
    try {
      const isDev = import.meta.env.DEV;
      const res = await fetch(API_ENDPOINTS.STATIONS(isDev));

      if (!res.ok) throw new Error("Network error");

      const rawData = await res.json();
      if (rawData.error) throw new Error(rawData.error);
      if (!Array.isArray(rawData)) throw new Error("Invalid response format");

      const normalized: Station[] = rawData.map((item: Record<string, unknown>) => ({
        id: item.id as number | string,
        name: item.name as string,
        file: item.station as string,
        station: item.station as string,
        image: item.logo as string,
        genre: (item.genre as string) || "Radio",
      }));

      normalized.sort((a: Station, b: Station) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );

      stations.set(normalized);
    } catch (e) {
      logger.error("[API] Failed to load stations", e);
      showToast(MSG.RADIO_FAILED_LOAD, "error");
    } finally {
      isLoadingRadio.set(false);
    }
  },

  async setAlarm(enabled: boolean, time: string, playlistName: string): Promise<true | undefined> {
    const isDev = import.meta.env.DEV;
    if (isDev) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append("action", "set_alarm");
      formData.append("enabled", enabled ? "1" : "0");
      formData.append("time", time);
      formData.append("playlist", playlistName);

      const res = await fetch(API_ENDPOINTS.SYNC, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Server error");
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      return true;
    } catch (e) {
      logger.error("[API] Failed to set alarm", e);
      throw e;
    }
  },

  async getServerTime(): Promise<string | null> {
    try {
      const res = await fetch(`${API_ENDPOINTS.SYNC}?action=get_time`);
      if (res.ok) {
        const data = await res.json();
        return data.time;
      }
    } catch (e) {
      logger.error("Failed to get server time", e);
    }
    return null;
  },

  async checkYandexAuth(): Promise<boolean> {
    try {
      const res = await YandexApi.request("status") as { authorized: boolean };
      yandexAuthStatus.set(res.authorized);
      return res.authorized;
    } catch (e) {
      logger.error("Yandex Auth Check Failed", e);
      yandexAuthStatus.set(false);
      return false;
    }
  },

  async saveYandexToken(token: string): Promise<boolean> {
    try {
      const res = await fetch(API_ENDPOINTS.YANDEX + "?action=save_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }

      showToast(MSG.YANDEX_CONNECTED, "success");
      yandexAuthStatus.set(true);
      return true;
    } catch (e) {
      logger.error(e);
      showToast(MSG.YANDEX_INVALID_TOKEN, "error");
      yandexAuthStatus.set(false);
      return false;
    }
  },

  async getYandexMeta(url: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(
        API_ENDPOINTS.YANDEX +
          "?action=get_meta&url=" +
          encodeURIComponent(url),
      );
      if (res.ok) return await res.json();
    } catch (e) {
      logger.warn("[API] Failed to fetch Yandex meta:", e);
    }
    return null;
  },

  async syncYandexFavorites(): Promise<void> {
    if (!get(yandexAuthStatus)) return;
    try {
      const res = await YandexApi.getFavoritesIds() as { ids?: (string | number)[] } | null;
      if (res && res.ids) {
        yandexFavorites.set(new Set(res.ids.map(String)));
        logger.log(`[API] Loaded ${res.ids.length} Yandex likes.`);
      }
    } catch (e) {
      logger.warn("[API] Failed to sync Yandex likes", e);
    }
  },
};
