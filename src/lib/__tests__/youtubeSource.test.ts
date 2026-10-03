// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { youtubeSource, youtubeRoutes, fetchYoutubeMeta } from "../sources/youtubeSource";
import { youtubeMeta, youtubeFavorites } from "../stores/youtube";
import { YoutubeApi } from "../youtube";
import { sourceLikesVersion } from "../playerHelpers";
import { navIdentityKey } from "../stores/navigation";
import type { Track, MpdStatus } from "../types";
import { queue, currentSong, activePlaylistTracks } from "../store";
import { METADATA_RETRY_DELAY } from "../sources/metadataRequest";

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("../mpd/client", () => ({ mpdClient: { send: sendMock } }));
const id = "abcdefghijk";
const uri = `http://127.0.0.1:8766/youtube/stream/${id}`;
const track: Track = { file: uri, title: "", artist: "", album: "", genre: "", track: "", time: 0, id: "42", pos: "1" };

beforeEach(() => {
  vi.restoreAllMocks();
  sendMock.mockReset().mockResolvedValue("Id: 75\nOK\n");
  youtubeMeta.set({});
  youtubeFavorites.set(new Set());
});

describe("YouTube queue metadata loading", () => {
  const stream = (id: string) => `http://127.0.0.1:8766/youtube/stream/${id}`;
  const pending = (id: string): Track => ({ ...track, file: stream(id), id, isMetadataPending: true });

  beforeEach(() => {
    vi.useFakeTimers();
    queue.set([]);
    activePlaylistTracks.set([]);
    currentSong.set({ ...track, file: "" });
  });
  afterEach(() => vi.useRealTimers());

  it("holds the skeleton across a transient failure and hydrates it on retry", async () => {
    const id = "retry000001";
    queue.set([pending(id)]);
    const request = vi.spyOn(YoutubeApi, "request").mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ [id]: { id, title: "Recovered", artist: "Artist", time: 180 } });
    const work = fetchYoutubeMeta([stream(id)]);
    await vi.advanceTimersByTimeAsync(METADATA_RETRY_DELAY - 1);
    expect(get(queue)[0].isMetadataPending).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await work;
    expect(request).toHaveBeenCalledTimes(2);
    expect(get(queue)[0]).toMatchObject({ title: "Recovered", artist: "Artist", isMetadataPending: false });
  });

  it("preserves partial successes and falls back only after the missing id's retry", async () => {
    const first = "partial0001";
    const second = "partial0002";
    queue.set([pending(first), pending(second)]);
    activePlaylistTracks.set([pending(second)]);
    currentSong.set(pending(second));
    const request = vi.spyOn(YoutubeApi, "request").mockResolvedValueOnce({ [first]: { id: first, title: "Ready", artist: "Artist" } }).mockResolvedValueOnce({});
    const work = fetchYoutubeMeta([stream(first), stream(second)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(get(queue)[0]).toMatchObject({ title: "Ready", isMetadataPending: false });
    expect(get(queue)[1].isMetadataPending).toBe(true);
    await vi.advanceTimersByTimeAsync(METADATA_RETRY_DELAY);
    await work;
    expect(request.mock.calls[1]?.[1]).toEqual({ ids: [second] });
    expect(get(queue)[1]).toMatchObject({ title: second, artist: "Unknown Artist", isMetadataPending: false });
    expect(get(activePlaylistTracks)[0].isMetadataPending).toBe(false);
    expect(get(currentSong).isMetadataPending).toBe(false);
    const song = pending(second);
    youtubeSource.enrichCurrentSong?.(song, { duration: 0 } as MpdStatus);
    expect(song.isMetadataPending).toBe(false);
    const missing: string[] = [];
    expect(youtubeSource.enrichQueueTrack?.(pending(second), missing)?.isMetadataPending).toBe(false);
    expect(missing).toEqual([]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("shares pending requests with both current-song and duplicate queue lookups", async () => {
    const id = "dedupe00001";
    let finish!: (value: Record<string, unknown>) => void;
    const request = vi.spyOn(YoutubeApi, "request").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    queue.set([pending(id)]);
    currentSong.set(pending(id));
    const first = fetchYoutubeMeta([stream(id), stream(id)]);
    const duplicate = fetchYoutubeMeta([stream(id)]);
    youtubeSource.enrichCurrentSong?.(pending(id), { duration: 0 } as MpdStatus);
    expect(request).toHaveBeenCalledTimes(1);
    finish({ [id]: { id, title: "Ready", artist: "Artist" } });
    await Promise.all([first, duplicate]);
    expect(get(queue)[0].isMetadataPending).toBe(false);
    expect(get(currentSong).isMetadataPending).toBe(false);
  });

  it("does not leave already-cached tracks pending even when duration is unknown", async () => {
    const id = "cached00001";
    queue.set([pending(id)]);
    youtubeMeta.set({ [id]: { ...pending(id), id, title: "Cached", artist: "Artist", service: "youtube", time: 0 } });
    const request = vi.spyOn(YoutubeApi, "request");
    await fetchYoutubeMeta([stream(id)]);
    expect(get(queue)[0]).toMatchObject({ title: "Cached", isMetadataPending: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("releases a stalled request after both bounded attempts and permits a later lookup", async () => {
    const id = "timeout0001";
    queue.set([pending(id)]);
    const request = vi.spyOn(YoutubeApi, "request").mockImplementation(() => new Promise<never>(() => {}));
    const work = fetchYoutubeMeta([stream(id)]);
    await vi.advanceTimersByTimeAsync(120_000 + METADATA_RETRY_DELAY);
    await work;
    expect(request).toHaveBeenCalledTimes(2);
    expect(get(queue)[0]).toMatchObject({ title: id, artist: "Unknown Artist", isMetadataPending: false });
    await vi.advanceTimersByTimeAsync(30_000);
    request.mockResolvedValue({ [id]: { id, title: "Recovered", artist: "Artist" } });
    await fetchYoutubeMeta([stream(id)]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(get(queue)[0]).toMatchObject({ title: "Recovered", isMetadataPending: false });
  });

  it("keeps metadata from earlier chunks when a later chunk fails", async () => {
    const ids = Array.from({ length: 7 }, (_, index) => `chunks0000${index}`);
    queue.set(ids.map(pending));
    const firstChunk = Object.fromEntries(ids.slice(0, 6).map((id) => [id, { id, title: `Song ${id}`, artist: "Artist" }]));
    const request = vi.spyOn(YoutubeApi, "request").mockResolvedValueOnce(firstChunk).mockRejectedValue(new Error("Offline"));
    const work = fetchYoutubeMeta(ids.map(stream));
    await vi.advanceTimersByTimeAsync(METADATA_RETRY_DELAY);
    await work;
    expect(request).toHaveBeenCalledTimes(3);
    expect(get(queue).slice(0, 6).every((row) => row.title.startsWith("Song ") && !row.isMetadataPending)).toBe(true);
    expect(get(queue)[6]).toMatchObject({ title: ids[6], artist: "Unknown Artist", isMetadataPending: false });
  });
});

describe("YouTube Music source", () => {
  it("plays source URIs through a stable MPD id instead of a queue index", async () => {
    const prepare = vi.spyOn(YoutubeApi, "request").mockResolvedValue({ status: "ok" });
    expect(await youtubeSource.playUri?.(`youtube:${id}`, 2)).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    expect(sendMock.mock.calls.map(([cmd]) => cmd)).toEqual([`addid "${uri}"`, "moveid 75 3", "playid 75"]);
    expect(await youtubeSource.playUri?.("local/song.flac", 2)).toBe(false);
  });
  it("keeps MPD untouched if preparing audio fails", async () => {
    vi.spyOn(YoutubeApi, "request").mockRejectedValue(new Error("Audio unavailable"));
    await expect(youtubeSource.prepareUri?.(uri)).rejects.toThrow("Audio unavailable");
    expect(sendMock).not.toHaveBeenCalled();
  });
  it("hydrates queue and current-song metadata and maintains stream duration", () => {
    youtubeMeta.set({ [id]: { ...track, id, title: "Song", artist: "Artist", time: 185, service: "youtube" } });
    const enriched = youtubeSource.enrichQueueTrack?.(track, []);
    expect(enriched).toMatchObject({ id: "42", title: "Song", time: 185, file: uri, pos: "1", service: "youtube" });
    expect(enriched?._uid).toBe("42");
    // Repeated songs share a service id but retain different MPD ids for keyed queue rows.
    expect(enriched?._uid).not.toBe(youtubeSource.enrichQueueTrack?.({ ...track, id: "43" }, [])?._uid);
    const song = { ...track };
    const status = { duration: 0 } as MpdStatus;
    youtubeSource.enrichCurrentSong?.(song, status);
    expect(song.title).toBe("Song");
    expect(status.duration).toBe(185);
    expect(youtubeSource.matchesPlaying?.(song, uri)).toBe(true);
  });
  it("updates the shared like trigger and rolls back failed mutations", async () => {
    vi.spyOn(YoutubeApi, "request").mockResolvedValue({ status: "ok" });
    await youtubeSource.toggleLike?.(track);
    expect(get(youtubeFavorites).has(id)).toBe(true);
    expect(get(sourceLikesVersion).has(id)).toBe(true);
    vi.spyOn(YoutubeApi, "request").mockRejectedValue(new Error("Network failure"));
    await youtubeSource.toggleLike?.(track);
    expect(get(youtubeFavorites).has(id)).toBe(true);
  });
  it("round-trips deep links and keeps search categories distinct", () => {
    for (const route of youtubeRoutes) {
      const data = route.routePrefix === "youtube_search" ? { query: "Artist / Name", filter: "albums" } : { id: "MPREb_test" };
      const path = route.buildPath(data)!;
      expect(route.parseParams(path.split("/").slice(1).map(decodeURIComponent))).toMatchObject(data);
    }
    expect(navIdentityKey("youtube_search", { query: "Name", filter: "songs" }))
      .not.toBe(navIdentityKey("youtube_search", { query: "Name", filter: "albums" }));
    expect(navIdentityKey("youtube_playlist", { id: "PL_test", title: "Old" }))
      .toBe(navIdentityKey("youtube_playlist", { id: "PL_test", title: "New" }));
    expect(navIdentityKey("yandex_playlist", { uid: "user", kind: "42", id: "user:42", title: "Playlist" }))
      .toBe(navIdentityKey("yandex_playlist", { uid: "user", kind: "42" }));
  });
});
