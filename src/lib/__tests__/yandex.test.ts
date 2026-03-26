// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../constants", () => ({
  API_ENDPOINTS: {
    get YANDEX() { return "/wave-yandex-api.php"; },
  },
}));

import { YandexApi } from "../yandex.js";

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

describe("YandexApi.request", () => {
  it("makes GET request with params", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: "ok" }),
    });

    const result = await YandexApi.request("search", { query: "test" });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain("action=search");
    expect(calledUrl).toContain("query=test");
    expect(result).toEqual({ result: "ok" });
  });

  it("makes POST request with body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: "ok" }),
    });

    await YandexApi.request("play_playlist", { tracks: [1, 2] }, "POST");

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ tracks: [1, 2] });
  });

  it("throws on API error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    await expect(YandexApi.request("status")).rejects.toThrow("API Error");
  });
});

describe("YandexApi convenience methods", () => {
  beforeEach(() => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
  });

  it("search passes query param", async () => {
    await YandexApi.search("radiohead");
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("action=search");
    expect(url).toContain("query=radiohead");
  });

  it("getUserPlaylists calls get_playlists", async () => {
    await YandexApi.getUserPlaylists();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("action=get_playlists");
  });

  it("getArtistDetails passes id", async () => {
    await YandexApi.getArtistDetails("12345");
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("action=get_artist_details");
    expect(url).toContain("id=12345");
  });

  it("getAlbumDetails passes id", async () => {
    await YandexApi.getAlbumDetails("67890");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("action=get_album_details");
  });

  it("getPlaylistTracks passes uid, kind, offset", async () => {
    await YandexApi.getPlaylistTracks("user1", "daily", 10);
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("uid=user1");
    expect(url).toContain("kind=daily");
    expect(url).toContain("offset=10");
  });

  it("playRadio builds station ID correctly", async () => {
    await YandexApi.playRadio("123", "track");
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("station=track%3A123");
  });

  it("playRadio defaults to user:onyourwave", async () => {
    await YandexApi.playRadio();
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("station=user%3Aonyourwave");
  });

  it("toggleLike sends like action", async () => {
    await YandexApi.toggleLike("999", false);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("action=like");
  });

  it("toggleLike sends dislike action for liked track", async () => {
    await YandexApi.toggleLike("999", true);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("action=dislike");
  });
});
