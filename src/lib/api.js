import { get } from "svelte/store";
import { API_ENDPOINTS } from "./constants";
import {
  isSyncingLibrary,
  showToast,
  isLoadingRadio,
  stations,
  yandexAuthStatus,
} from "./store";
import SyncWorker from "./workers/sync.worker.js?worker";

export const ApiActions = {
  async syncLibrary() {
    if (get(isSyncingLibrary)) return;

    isSyncingLibrary.set(true);
    const worker = new SyncWorker();

    const apiUrl = window.location.origin + "/wave-api.php";

    worker.postMessage({
      type: "START_SYNC",
      payload: {
        url: apiUrl,
      },
    });

    worker.onmessage = (e) => {
      const { type, status, count, message } = e.data;

      if (type === "PROGRESS") {
        const labels = {
          connecting: "Requesting library...",
          downloading: "Downloading data...",
          parsing: "Processing metadata...",
          saving: `Saving ${count} tracks...`,
        };
        if (labels[status]) showToast(labels[status], "info");
      }

      if (type === "DONE") {
        showToast(`Library updated: ${count} tracks`, "success");
        isSyncingLibrary.set(false);
        worker.terminate();
      }

      if (type === "ERROR") {
        console.error("[API] Sync Error:", message);
        showToast(`Sync Failed: ${message}`, "error");
        isSyncingLibrary.set(false);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      console.error("[API] Worker crash:", err);
      showToast("Sync worker crashed", "error");
      isSyncingLibrary.set(false);
      worker.terminate();
    };
  },

  async loadRadioStations() {
    if (get(isLoadingRadio)) return;

    isLoadingRadio.set(true);
    try {
      const isDev = import.meta.env.DEV;
      const res = await fetch(API_ENDPOINTS.STATIONS(isDev));

      if (!res.ok) throw new Error("Network error");

      const rawData = await res.json();
      if (rawData.error) throw new Error(rawData.error);
      if (!Array.isArray(rawData)) throw new Error("Invalid response format");

      const normalized = rawData.map((item) => ({
        id: item.id,
        name: item.name,
        file: item.station,
        station: item.station,
        image: item.logo,
        genre: item.genre || "Radio",
      }));

      normalized.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );

      stations.set(normalized);
    } catch (e) {
      console.error("[API] Failed to load stations", e);
      showToast("Failed to load radio", "error");
    } finally {
      isLoadingRadio.set(false);
    }
  },

  async setAlarm(enabled, time, playlistName) {
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.log(`[DEV] Setting Alarm: ${enabled}, ${time}, ${playlistName}`);
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
      console.error("[API] Failed to set alarm", e);
      throw e;
    }
  },

  async getServerTime() {
    try {
      const res = await fetch(`${API_ENDPOINTS.SYNC}?action=get_time`);
      if (res.ok) {
        const data = await res.json();
        return data.time;
      }
    } catch (e) {
      console.error("Failed to get server time", e);
    }
    return null;
  },

  async checkYandexAuth() {
    try {
      const res = await fetch(API_ENDPOINTS.YANDEX + "?action=status");
      const data = await res.json();

      yandexAuthStatus.set(data.authorized);
      return data.authorized;
    } catch (e) {
      console.error("Yandex Auth Check Failed", e);
      yandexAuthStatus.set(false);
      return false;
    }
  },

  async saveYandexToken(token) {
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

      showToast("Yandex connected successfully", "success");
      yandexAuthStatus.set(true);
      return true;
    } catch (e) {
      console.error(e);
      showToast("Invalid token or server error", "error");
      yandexAuthStatus.set(false);
      return false;
    }
  },

  async playYandexStation(stationId = "user:onetwo") {
    try {
      await fetch(
        API_ENDPOINTS.YANDEX + `?action=play_station&station=${stationId}`,
      );
      showToast("Starting My Vibe...", "success");
    } catch (e) {
      showToast("Failed to start radio", "error");
    }
  },

  async getYandexMeta(url) {
    try {
      const res = await fetch(
        API_ENDPOINTS.YANDEX +
          "?action=get_meta&url=" +
          encodeURIComponent(url),
      );
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  },
};
