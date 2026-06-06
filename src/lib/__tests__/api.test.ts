// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

// Mock dependencies
vi.mock("../constants", () => ({
  API_ENDPOINTS: {
    get SYNC() { return "/wave-api.php"; },
    get YANDEX() { return "/wave-yandex-api.php"; },
    STATIONS: () => "/wave-api.php?action=stations",
  },
}));

vi.mock("../store", () => {
  const { writable } = require("svelte/store");
  return {
    isSyncingLibrary: writable(false),
    isLoadingRadio: writable(false),
    stations: writable([]),
    yandexAuthStatus: writable(false),
    yandexFavorites: writable(new Set()),
    showToast: vi.fn(),
  };
});

vi.mock("../workers/sync.worker.js?worker", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    })),
  };
});

vi.mock("../yandex", () => ({
  YandexApi: {
    request: vi.fn(),
    getFavoritesIds: vi.fn(),
  },
}));

import { ApiActions } from "../api.js";
import { stations, yandexAuthStatus, showToast } from "../store";
import { YandexApi } from "../yandex";

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

describe("ApiActions.loadRadioStations", () => {
  it("loads and normalizes stations", async () => {
    const rawStations = [
      { id: 1, name: "Jazz FM", station: "http://jazz.fm/stream", logo: "jazz.png", genre: "Jazz" },
      { id: 2, name: "Rock Radio", station: "http://rock.radio/stream", logo: "rock.png", genre: "Rock" },
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawStations),
    });

    await ApiActions.loadRadioStations();

    const result = get(stations);
    expect(result).toHaveLength(2);
    // Should be sorted alphabetically
    expect(result[0].name).toBe("Jazz FM");
    expect(result[1].name).toBe("Rock Radio");
    expect(result[0].image).toBe("jazz.png");
    expect(result[0].file).toBe("http://jazz.fm/stream");
  });

  it("handles network error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    await ApiActions.loadRadioStations();
    expect(showToast).toHaveBeenCalledWith("Failed to load radio", "error");
  });

  it("handles invalid response format", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "server error" }),
    });
    await ApiActions.loadRadioStations();
    expect(showToast).toHaveBeenCalledWith("Failed to load radio", "error");
  });
});

describe("ApiActions.getServerTime", () => {
  it("returns server time", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ time: "2024-01-15T10:00:00Z" }),
    });
    const result = await ApiActions.getServerTime();
    expect(result).toBe("2024-01-15T10:00:00Z");
  });

  it("returns null on error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));
    const result = await ApiActions.getServerTime();
    expect(result).toBeNull();
  });
});

describe("ApiActions.checkYandexAuth", () => {
  it("returns true when authorized", async () => {
    (YandexApi.request as ReturnType<typeof vi.fn>).mockResolvedValue({ authorized: true });
    const result = await ApiActions.checkYandexAuth();
    expect(result).toBe(true);
    expect(get(yandexAuthStatus)).toBe(true);
  });

  it("returns false on error", async () => {
    (YandexApi.request as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fail"));
    const result = await ApiActions.checkYandexAuth();
    expect(result).toBe(false);
    expect(get(yandexAuthStatus)).toBe(false);
  });
});

describe("ApiActions.saveYandexToken", () => {
  it("saves token successfully", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    const result = await ApiActions.saveYandexToken("my-token");
    expect(result).toBe(true);
    expect(get(yandexAuthStatus)).toBe(true);
    expect(showToast).toHaveBeenCalledWith("Yandex connected successfully", "success");
  });

  it("handles server error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "invalid token" }),
    });
    const result = await ApiActions.saveYandexToken("bad-token");
    expect(result).toBe(false);
    expect(get(yandexAuthStatus)).toBe(false);
  });
});

describe("ApiActions.getYandexMeta", () => {
  it("returns meta on success", async () => {
    const meta = { title: "Track", artist: "Artist" };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(meta),
    });
    const result = await ApiActions.getYandexMeta("http://yandex.net/track/123");
    expect(result).toEqual(meta);
  });

  it("returns null on failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fail"));
    const result = await ApiActions.getYandexMeta("bad-url");
    expect(result).toBeNull();
  });
});

describe("ApiActions.batchGetYandexMeta", () => {
  it("returns empty object for empty input without calling fetch", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockClear();
    const result = await ApiActions.batchGetYandexMeta([]);
    expect(result).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs urls array and returns keyed results", async () => {
    const payload = {
      "yandex:123": { title: "A", artist: "X" },
      "http://cdn/track/456": { title: "B", artist: "Y" },
    };
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    });
    const urls = ["yandex:123", "http://cdn/track/456"];
    const result = await ApiActions.batchGetYandexMeta(urls);
    expect(result).toEqual(payload);

    const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(String(call[0])).toContain("action=batch_get_meta");
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ urls });
  });

  it("returns empty object on fetch failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("net"));
    const result = await ApiActions.batchGetYandexMeta(["u1"]);
    expect(result).toEqual({});
  });
});
