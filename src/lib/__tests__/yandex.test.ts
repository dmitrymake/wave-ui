// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";

import { YandexApi, YandexApiError, isYandexAuthError } from "../yandex.js";
import { TimeoutError } from "../http.js";

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

  it("throws YandexApiError on non-ok response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });
    await expect(YandexApi.request("status")).rejects.toBeInstanceOf(YandexApiError);
  });

  it("flags 401/403 as auth errors", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 });
    const err = (await YandexApi.request("status").catch((e) => e)) as YandexApiError;
    expect(err).toBeInstanceOf(YandexApiError);
    expect(err.status).toBe(401);
    expect(isYandexAuthError(err)).toBe(true);
    expect(isYandexAuthError(new Error("network"))).toBe(false);
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
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ artist: { name: "A" }, tracks: [{ id: "1" }], albums: [] }),
    });
    await YandexApi.getArtistDetails("12345");
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("action=get_artist_details");
    expect(url).toContain("id=12345");
  });

  it("getAlbumDetails passes id", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: "Al", tracks: [{ id: "7" }] }),
    });
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

  it("feedbackSkip POSTs track_id and played_seconds", async () => {
    await YandexApi.feedbackSkip("1234", 45.8);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("action=feedback_skip");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ track_id: "1234", played_seconds: 45 });
  });

  it("feedbackSkip floors negative seconds to 0", async () => {
    await YandexApi.feedbackSkip("1", -5);
    const opts = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse(opts.body).played_seconds).toBe(0);
  });
});

describe("getArtistDetails/getAlbumDetails resilience", () => {
  const fetchMock = () => globalThis.fetch as ReturnType<typeof vi.fn>;
  const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });
  const fullArtist = () => ({
    artist: { name: "Artist" },
    cover: "",
    tracks: [{ id: "1", title: "T" }],
    albums: [],
  });

  it("returns first-attempt data without retry", async () => {
    fetchMock().mockResolvedValue(ok(fullArtist()));
    const res = await YandexApi.getArtistDetails("1");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(res.artist?.name).toBe("Artist");
  });

  it("retries once on timeout then succeeds", async () => {
    fetchMock()
      .mockRejectedValueOnce(new TimeoutError(1))
      .mockResolvedValue(ok(fullArtist()));
    const res = await YandexApi.getArtistDetails("1");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(res.artist?.name).toBe("Artist");
  });

  it("retries once on empty-200 then succeeds", async () => {
    fetchMock().mockResolvedValueOnce(ok({ artist: [], tracks: [], albums: [] })).mockResolvedValue(ok(fullArtist()));
    const res = await YandexApi.getArtistDetails("1");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(res.artist?.name).toBe("Artist");
  });

  it("retries once on 500 then succeeds", async () => {
    fetchMock()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue(ok(fullArtist()));
    const res = await YandexApi.getArtistDetails("1");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(res.artist?.name).toBe("Artist");
  });

  it("throws after two timeouts", async () => {
    fetchMock().mockRejectedValue(new TimeoutError(1));
    await expect(YandexApi.getArtistDetails("1")).rejects.toBeInstanceOf(TimeoutError);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("throws after two empty responses without caching anything", async () => {
    fetchMock().mockResolvedValue(ok({ artist: [], tracks: [], albums: [] }));
    await expect(YandexApi.getArtistDetails("1")).rejects.toThrow(/empty/);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("does not retry 401 auth errors", async () => {
    fetchMock().mockResolvedValue({ ok: false, status: 401 });
    const err = (await YandexApi.getArtistDetails("1").catch((e) => e)) as YandexApiError;
    expect(err).toBeInstanceOf(YandexApiError);
    expect(isYandexAuthError(err)).toBe(true);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("getAlbumDetails retries empty then succeeds", async () => {
    fetchMock()
      .mockResolvedValueOnce(ok({ title: "", tracks: [] }))
      .mockResolvedValue(ok({ title: "Album", tracks: [{ id: "7" }] }));
    const res = await YandexApi.getAlbumDetails("9");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(res.title).toBe("Album");
  });
});
