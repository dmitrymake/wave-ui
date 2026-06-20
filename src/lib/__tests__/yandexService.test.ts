// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

// checkYandexAuth / saveYandexToken are already covered in api.test.ts; this file
// covers the daemon-state and favorites-sync methods only.
vi.mock("../store", () => ({
  showToast: vi.fn(),
}));

// Yandex stores now live in their own domain module; production code imports
// them from "../stores/yandex" (no longer re-exported by the shared barrel), so
// the stubs must be wired here for the test to share the same store instances.
vi.mock("../stores/yandex", () => {
  const { writable } = require("svelte/store");
  return {
    yandexAuthStatus: writable(false),
    yandexFavorites: writable(new Set()),
    yandexState: writable({ active: false, context_name: "" }),
  };
});

const getFavoritesIdsMock = vi.fn();
// The Yandex endpoint URL now lives in the Yandex domain module ("../yandex")
// instead of shared constants, so the stable test URL is provided here.
vi.mock("../yandex", () => ({
  YANDEX_ENDPOINT: { URL: "/wave-yandex-api.php" },
  YandexApi: {
    getFavoritesIds: (...a: unknown[]) => getFavoritesIdsMock(...a),
  },
}));

import { YandexService } from "../yandexService";
import { showToast } from "../store";
import { yandexAuthStatus, yandexFavorites, yandexState } from "../stores/yandex";

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
  yandexAuthStatus.set(false);
  yandexFavorites.set(new Set());
  yandexState.set({ active: false, context_name: "" });
});

describe("YandexService.refreshYandexDaemonState", () => {
  it("hits the get_state endpoint and stores the returned state", async () => {
    const daemon = { active: true, context_name: "My Wave" };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(daemon),
    });

    await YandexService.refreshYandexDaemonState();

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls).toContain("/wave-yandex-api.php?action=get_state");
    expect(get(yandexState)).toEqual(daemon);
  });

  it("leaves state untouched when the request is not ok", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    await YandexService.refreshYandexDaemonState();

    expect(get(yandexState)).toEqual({ active: false, context_name: "" });
  });

  it("swallows a network error without throwing", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    await expect(YandexService.refreshYandexDaemonState()).resolves.toBeUndefined();
  });
});

describe("YandexService.stopYandexDaemon", () => {
  it("calls the stop endpoint then refreshes the daemon state", async () => {
    const refreshed = { active: false, context_name: "" };
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      // First call: stop_daemon.
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      // Second call: the get_state refresh.
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(refreshed) });

    await YandexService.stopYandexDaemon();

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe("/wave-yandex-api.php?action=stop_daemon");
    expect(calls[1]).toBe("/wave-yandex-api.php?action=get_state");
    expect(showToast).toHaveBeenCalledWith("Daemon stopped (Auto-fill disabled)", "info");
    expect(get(yandexState)).toEqual(refreshed);
  });

  it("toasts an error when the stop request fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));

    await YandexService.stopYandexDaemon();

    expect(showToast).toHaveBeenCalledWith("Failed to stop daemon", "error");
  });
});

describe("YandexService.syncYandexFavorites", () => {
  it("populates yandexFavorites with stringified ids when authorized", async () => {
    yandexAuthStatus.set(true);
    getFavoritesIdsMock.mockResolvedValue({ ids: [101, 202, 303] });

    await YandexService.syncYandexFavorites();

    expect(getFavoritesIdsMock).toHaveBeenCalledTimes(1);
    expect(get(yandexFavorites)).toEqual(new Set(["101", "202", "303"]));
  });

  it("no-ops (no API call, favorites untouched) when not authorized", async () => {
    yandexAuthStatus.set(false);

    await YandexService.syncYandexFavorites();

    expect(getFavoritesIdsMock).not.toHaveBeenCalled();
    expect(get(yandexFavorites)).toEqual(new Set());
  });

  it("leaves favorites untouched when the API rejects", async () => {
    yandexAuthStatus.set(true);
    getFavoritesIdsMock.mockRejectedValue(new Error("token expired"));

    await YandexService.syncYandexFavorites();

    expect(get(yandexFavorites)).toEqual(new Set());
  });
});
