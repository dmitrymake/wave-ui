// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { describe, it, expect, vi, afterEach } from "vitest";
import { YoutubeApi, YoutubeApiError, normalizeYoutubeTrack, isYoutubeAuthError } from "../youtube";
import { getYoutubeIdFromUrl, youtubeStreamUrl } from "../sources/youtubeUri";

const id = "abcdefghijk";
afterEach(() => vi.unstubAllGlobals());

describe("YouTube Music source identifiers", () => {
  it("recognizes stable MPD URLs and source URIs, including punctuation in video ids", () => {
    for (const value of [id, "a_b-cdefghi"]) {
      expect(getYoutubeIdFromUrl(youtubeStreamUrl(value))).toBe(value);
      expect(getYoutubeIdFromUrl(`youtube:${value}`)).toBe(value);
    }
  });
  it("does not claim arbitrary streams or malformed ids", () => {
    for (const value of [null, "youtube:123", `https://evil.test/youtube/stream/${id}`,
      `http://127.0.0.1:8766/youtube/stream/${id}?other=1`, `https://music.youtube.com/watch?v=${id}`]) {
      expect(getYoutubeIdFromUrl(value)).toBeNull();
    }
    expect(() => youtubeStreamUrl("../../etc/passwd")).toThrow();
  });
});

describe("YouTube Music API", () => {
  it("normalizes metadata and builds a stable device stream URL", () => {
    expect(normalizeYoutubeTrack({ id, title: "Song", artist: "Artist", time: 123, file: "https://untrusted.test",
      image: "https://example.com/art.jpg", artistId: "UC_artist" })).toMatchObject({
      id, title: "Song", artist: "Artist", time: 123, file: youtubeStreamUrl(id), service: "youtube", artistId: "UC_artist",
    });
    expect(normalizeYoutubeTrack({ id: "bad", title: "Song" })).toBeNull();
    expect(normalizeYoutubeTrack({ id, title: "Song", time: NaN, image: "javascript:alert(1)" })).toMatchObject({ time: 0, image: undefined });
  });
  it("uses same-origin JSON POST for session credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ authorized: true, playbackReady: true })));
    vi.stubGlobal("fetch", fetchMock);
    await YoutubeApi.request("save_auth", { auth: "session" }, "POST");
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).origin).toBe(window.location.origin);
    expect(new URL(url).pathname).toBe("/wave-youtube-api.php");
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify({ auth: "session" }));
    expect(url).not.toContain("session");
  });
  it("distinguishes expired sessions from transport/proxy failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Session expired" }), { status: 401 })));
    const error = await YoutubeApi.status().catch((e: unknown) => e);
    expect(isYoutubeAuthError(error)).toBe(true);
    expect(error).toBeInstanceOf(YoutubeApiError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Missing endpoint</html>")));
    await expect(YoutubeApi.status()).rejects.toThrow("bridge is unavailable");
  });
  it("drops malformed search items and passes through the search category", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tracks: [{ id, title: "Song" }, { id: "bad" }], cards: [{ id: "MPREb_album", title: "Album", kind: "album" }, { kind: "unknown" }], hiddenCount: 2,
    })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await YoutubeApi.search("Artist name", "albums");
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("filter")).toBe("albums");
    expect(result.tracks).toHaveLength(1);
    expect(result.cards).toHaveLength(1);
    expect(result.hiddenCount).toBe(2);
  });
});
