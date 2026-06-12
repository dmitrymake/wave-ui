// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { get } from "svelte/store";
import { showToast } from "./store";
import { yandexAuthStatus, yandexFavorites, yandexState } from "./stores/yandex";
import { YandexApi, YANDEX_ENDPOINT } from "./yandex";
import { MSG } from "./messages";
import { logger } from "./logger";
import type { YandexStatusResponse } from "./types/yandex";

export const YandexService = {
  async checkYandexAuth(): Promise<boolean> {
    try {
      const res = await YandexApi.request<YandexStatusResponse>("status");
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
      const res = await fetch(YANDEX_ENDPOINT.URL + "?action=save_token", {
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

  async getYandexDebugDump(): Promise<Record<string, unknown>> {
    const res = await fetch(YANDEX_ENDPOINT.URL + "?action=debug_dump");
    if (!res.ok) throw new Error("debug_dump request failed");
    return await res.json();
  },

  async refreshYandexDaemonState(): Promise<void> {
    try {
      const res = await fetch(YANDEX_ENDPOINT.URL + "?action=get_state");
      if (res.ok) {
        const data = await res.json();
        yandexState.set(data);
      }
    } catch (e) {
      logger.warn("[API] Failed to fetch Yandex state:", e);
    }
  },

  async stopYandexDaemon(): Promise<void> {
    try {
      await fetch(YANDEX_ENDPOINT.URL + "?action=stop_daemon");
      showToast(MSG.QUEUE_DAEMON_STOPPED, "info");
      await YandexService.refreshYandexDaemonState();
    } catch (e) {
      showToast(MSG.QUEUE_FAILED_STOP_DAEMON, "error");
    }
  },

  async syncYandexFavorites(): Promise<void> {
    if (!get(yandexAuthStatus)) return;
    try {
      const res = await YandexApi.getFavoritesIds();
      if (res && res.ids) {
        yandexFavorites.set(new Set(res.ids.map(String)));
        logger.log(`[API] Loaded ${res.ids.length} Yandex likes.`);
      }
    } catch (e) {
      logger.warn("[API] Failed to sync Yandex likes", e);
    }
  },
};
