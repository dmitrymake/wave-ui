import { get } from "svelte/store";
import { API_ENDPOINTS } from "./constants";
import { isSyncingLibrary, showToast, isLoadingRadio, stations } from "./store";
import SyncWorker from "./workers/sync.worker.js?worker";

/**
 * Actions for interacting with the wave-api.php backend.
 */
export const ApiActions = {
  /**
   * Starts library synchronization via Web Worker to prevent UI blocking during large JSON parsing.
   */
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

  /**
   * Loads radio station list and normalizes it for the player.
   */
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

      // Sort alphabetically by name
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
};
