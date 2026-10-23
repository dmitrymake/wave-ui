// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import type { Track } from "../types";

// Capture MPD commands and feed canned responses. MpdParser is left REAL so the
// position math (parseKeyValue of status/playlistinfo) is exercised end to end.
const sendMock = vi.fn<(cmd: string) => Promise<string>>();
vi.mock("../mpd/client", () => ({
  mpdClient: { send: (cmd: string) => sendMock(cmd) },
}));

const requestMock = vi.fn().mockResolvedValue({});
vi.mock("../yandex", () => ({
  // The Yandex meta-fetch endpoint URL moved into the Yandex domain module.
  YANDEX_ENDPOINT: { URL: "/wave-yandex-api.php" },
  YandexApi: {
    request: (...a: unknown[]) => requestMock(...a),
    feedbackSkip: vi.fn().mockResolvedValue({}),
    playRadio: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../store", () => {
  const { writable } = require("svelte/store");
  return {
    status: writable({ duration: 0 }),
    currentSong: writable({ file: "" }),
    queue: writable([]),
    activePlaylistTracks: writable([]),
    activeMenuTab: writable("library"),
    navigationStack: writable([]),
    showToast: vi.fn(),
  };
});

// Yandex stores now live in their own domain module; production code imports
// them from "../stores/yandex" (no longer re-exported by the shared barrel), so
// the stubs must be wired here for the test to share the same store instances.
vi.mock("../stores/yandex", () => {
  const { writable } = require("svelte/store");
  return {
    yandexContext: writable({ streamCache: {} }),
    yandexFavorites: writable(new Set()),
    yandexState: writable({ active: false, context_name: "" }),
    yandexAuthStatus: writable(false),
  };
});

import { yandexSource } from "../sources/yandexSource";
import type { TrackSource } from "../sources/trackSource";
import { yandexContext } from "../stores/yandex";
import { queue, currentSong, activePlaylistTracks, status } from "../store";
import { METADATA_RETRY_DELAY } from "../sources/metadataRequest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../http", async (original) => ({
  ...await original<typeof import("../http")>(),
  fetchWithTimeout: fetchMock,
}));

// These TrackSource methods are optional on the interface but always implemented by
// the Yandex source; narrow them so the tests can call them without `?.`/`!` noise.
const src = yandexSource as TrackSource &
  Required<Pick<TrackSource, "playUri" | "playNext" | "enrichQueueTrack" | "matches">>;

const baseTrack = (over: Partial<Track>): Track => ({
  file: "",
  title: "",
  artist: "",
  album: "",
  genre: "",
  time: 0,
  track: "",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requestMock.mockResolvedValue({});
  yandexContext.set({ streamCache: {} });
});

describe("src.playUri", () => {
  it("returns false for a non-yandex uri (lets the generic path handle it)", async () => {
    expect(await src.playUri("Music/x.flac", 0)).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("appends, resolves the new track's MPD id, then moves/plays BY ID (race-safe)", async () => {
    let statusCalls = 0;
    sendMock.mockImplementation(async (cmd: string) => {
      if (cmd === "status") {
        statusCalls++;
        return statusCalls === 1 ? "playlistlength: 3\nOK\n" : "playlistlength: 4\nOK\n";
      }
      if (cmd.startsWith("playlistinfo")) return "file: yandex\nId: 42\nPos: 3\nOK\n";
      return "OK\n";
    });

    const handled = await src.playUri("yandex:777", 1);

    expect(handled).toBe(true);
    expect(requestMock).toHaveBeenCalledWith("play_track", { id: "777", append: 1 }, "GET", 75_000);
    // The appended track sits at the new last position (lenAfter - 1 = 3); its stable
    // Id is read from playlistinfo and used for move/play — not the raw index.
    expect(sendMock).toHaveBeenCalledWith("playlistinfo 3");
    expect(sendMock).toHaveBeenCalledWith("moveid 42 2"); // targetPos = currentPos + 1
    expect(sendMock).toHaveBeenCalledWith("playid 42");
  });

  it("uses the bridge's actual MPD id even when a concurrent refill also grows the queue", async () => {
    requestMock.mockResolvedValue({ mpd_id: 91 });
    sendMock.mockResolvedValue("playlistlength: 3\nOK\n");
    await src.playUri("yandex:777", 1);
    expect(sendMock).toHaveBeenCalledWith("moveid 91 2");
    expect(sendMock).toHaveBeenCalledWith("playid 91");
    expect(sendMock.mock.calls.some(([cmd]) => cmd.startsWith("playlistinfo"))).toBe(false);
  });

  it("discards a late append after loading was cancelled instead of starting playback", async () => {
    let current = true;
    let resolveAppend!: (result: { mpd_id: number }) => void;
    requestMock.mockImplementation(() => new Promise((resolve) => { resolveAppend = resolve; }));
    sendMock.mockResolvedValue("playlistlength: 3\nOK\n");
    const playback = src.playUri("yandex:777", 1, () => current);
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledWith(
      "play_track", { id: "777", append: 1 }, "GET", 75_000,
    ));
    current = false;
    resolveAppend({ mpd_id: 91 });
    await playback;
    expect(sendMock).toHaveBeenCalledWith("deleteid 91");
    expect(sendMock).not.toHaveBeenCalledWith("playid 91");
    expect(sendMock.mock.calls.some(([cmd]) => cmd.startsWith("moveid"))).toBe(false);
  });

  it("does NOT move/play when the queue did not grow (append failed / raced)", async () => {
    sendMock.mockResolvedValue("playlistlength: 3\nOK\n"); // before === after === 3

    const handled = await src.playUri("yandex:9", 0);

    expect(handled).toBe(true);
    expect(requestMock).toHaveBeenCalledWith("play_track", { id: "9", append: 1 }, "GET", 75_000);
    const issued = sendMock.mock.calls.map((c) => c[0]);
    expect(issued.some((c) => c.startsWith("moveid"))).toBe(false);
    expect(issued.some((c) => c.startsWith("playid"))).toBe(false);
    expect(issued.some((c) => c.startsWith("playlistinfo"))).toBe(false);
  });
});

describe("src.playNext", () => {
  it("moves the appended track to currentPos+1 by id, without starting playback", async () => {
    let statusCalls = 0;
    sendMock.mockImplementation(async (cmd: string) => {
      if (cmd === "status") {
        statusCalls++;
        return statusCalls === 1 ? "playlistlength: 5\nOK\n" : "playlistlength: 6\nOK\n";
      }
      if (cmd.startsWith("playlistinfo")) return "file: yandex\nId: 99\nPos: 5\nOK\n";
      return "OK\n";
    });

    const handled = await src.playNext("yandex:1", 2);

    expect(handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith("playlistinfo 5");
    expect(sendMock).toHaveBeenCalledWith("moveid 99 3"); // currentPos + 1
    const issued = sendMock.mock.calls.map((c) => c[0]);
    expect(issued.some((c) => c.startsWith("playid"))).toBe(false);
  });
});

describe("src.enrichQueueTrack", () => {
  it("enriches a queue track from the stream cache (by file key)", () => {
    yandexContext.set({
      streamCache: {
        "yandex:55": {
          id: "55",
          title: "Cached Title",
          artist: "Cached Artist",
          album: "Alb",
          image: "img.jpg",
          time: 200,
          isYandex: true,
          file: "yandex:55",
        },
      },
    });

    const toFetch: string[] = [];
    const result = src.enrichQueueTrack(baseTrack({ file: "yandex:55", id: "mpd-7" }), toFetch);

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Cached Title");
    expect(result?.artist).toBe("Cached Artist");
    expect(result?.service).toBe("yandex");
    expect(result?.id).toBe("55");
    expect(toFetch).toHaveLength(0);
  });

  it("returns null and queues the file for fetching on a cache miss", () => {
    const toFetch: string[] = [];
    const result = src.enrichQueueTrack(baseTrack({ file: "yandex:404" }), toFetch);

    expect(result).toBeNull();
    expect(toFetch).toContain("yandex:404");
  });
});

describe("queue metadata loading", () => {
  const file = (id: number) => `/dev/shm/yandex_music/tracks/${id}.mp3`;
  const pending = (id: number) => baseTrack({ file: file(id), id: String(id), isMetadataPending: true });
  const response = (data: unknown) => ({ ok: true, json: async () => data });

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    queue.set([]);
    activePlaylistTracks.set([]);
    currentSong.set(baseTrack({}));
  });

  afterEach(() => vi.useRealTimers());

  it("keeps numeric filenames hidden through a failed batch and retries once", async () => {
    const first = file(700001);
    const second = file(700002);
    queue.set([pending(700001), pending(700002)]);
    fetchMock.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(response({
      [first]: { id: "700001", title: "First", artist: "Artist", image: "cover.jpg", time: 180 },
      [second]: { id: "700002", title: "Second", artist: "Artist" },
    }));
    const request = yandexSource.fetchQueueMeta?.([first, first, second]);
    await vi.advanceTimersByTimeAsync(METADATA_RETRY_DELAY - 1);
    expect(get(queue).every((row) => row.isMetadataPending)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).urls).toEqual([first, second]);
    await vi.advanceTimersByTimeAsync(1);
    await request;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(get(queue)[0]).toMatchObject({ title: "First", artist: "Artist", image: "cover.jpg", isMetadataPending: false });
    expect(get(queue)[1]).toMatchObject({ title: "Second", isMetadataPending: false });
  });

  it("retains successful rows and retries only the invalid or omitted metadata", async () => {
    const first = file(700003);
    const second = file(700004);
    queue.set([pending(700003), pending(700004)]);
    activePlaylistTracks.set([pending(700004)]);
    currentSong.set(pending(700004));
    fetchMock.mockResolvedValueOnce(response({ [first]: { id: "700003", title: "Ready", artist: "Artist" }, [second]: { title: [] } }))
      .mockResolvedValueOnce(response({}));
    const request = yandexSource.fetchQueueMeta?.([first, second]);
    await vi.advanceTimersByTimeAsync(0);
    expect(get(queue)[0]).toMatchObject({ title: "Ready", isMetadataPending: false });
    expect(get(queue)[1].isMetadataPending).toBe(true);
    await vi.advanceTimersByTimeAsync(METADATA_RETRY_DELAY);
    await request;
    expect(fetchMock.mock.calls[1][0]).toContain("action=get_meta");
    expect(fetchMock.mock.calls[1][0]).toContain(encodeURIComponent(second));
    expect(get(queue)[1]).toMatchObject({ title: "700004.mp3", artist: "Unknown Artist", isMetadataPending: false });
    expect(get(activePlaylistTracks)[0].isMetadataPending).toBe(false);
    expect(get(currentSong).isMetadataPending).toBe(false);

    const song = pending(700004);
    yandexSource.enrichCurrentSong?.(song, get(status));
    expect(song).toMatchObject({ title: "700004.mp3", artist: "Unknown Artist", isMetadataPending: false });
    const toFetch: string[] = [];
    expect(yandexSource.enrichQueueTrack?.(pending(700004), toFetch)?.isMetadataPending).toBe(false);
    expect(toFetch).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares an in-flight batch with current-song and overlapping queue requests", async () => {
    const first = file(700005);
    const second = file(700006);
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    queue.set([pending(700005), pending(700006)]);
    currentSong.set(pending(700005));
    const batch = yandexSource.fetchQueueMeta?.([first, second]);
    const duplicate = yandexSource.fetchQueueMeta?.([first]);
    yandexSource.enrichCurrentSong?.(pending(700005), get(status));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(get(queue).every((row) => row.isMetadataPending)).toBe(true);
    finish(response({ [first]: { id: "700005", title: "First", artist: "Artist" }, [second]: { id: "700006", title: "Second", artist: "Artist" } }));
    await Promise.all([batch, duplicate]);
    expect(get(queue).every((row) => !row.isMetadataPending)).toBe(true);
    expect(get(currentSong).title).toBe("First");
  });

  it("patches pending rows from metadata that was cached before the fetch began", async () => {
    const url = file(700007);
    queue.set([pending(700007)]);
    activePlaylistTracks.set([pending(700007)]);
    currentSong.set(pending(700007));
    yandexContext.set({ streamCache: { [url]: { id: "700007", file: url, title: "Cached", artist: "Artist", isYandex: true } } });
    await yandexSource.fetchQueueMeta?.([url]);
    expect(get(queue)[0]).toMatchObject({ title: "Cached", isMetadataPending: false });
    expect(get(activePlaylistTracks)[0].isMetadataPending).toBe(false);
    expect(get(currentSong).isMetadataPending).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("releases all pending rows after malformed batch responses", async () => {
    queue.set([pending(700008), pending(700009)]);
    fetchMock.mockResolvedValue(response([]));
    const request = yandexSource.fetchQueueMeta?.([file(700008), file(700009)]);
    await vi.advanceTimersByTimeAsync(METADATA_RETRY_DELAY);
    await request;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(get(queue).map((row) => row.title)).toEqual(["700008.mp3", "700009.mp3"]);
    expect(get(queue).every((row) => !row.isMetadataPending)).toBe(true);
  });

  it("bounds stalled response-body decoding and eventually releases the skeleton", async () => {
    queue.set([pending(700010)]);
    fetchMock.mockResolvedValue({ ok: true, json: () => new Promise<never>(() => {}) });
    const request = yandexSource.fetchQueueMeta?.([file(700010)]);
    await vi.advanceTimersByTimeAsync(24_000 + METADATA_RETRY_DELAY);
    await request;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(get(queue)[0]).toMatchObject({ title: "700010.mp3", artist: "Unknown Artist", isMetadataPending: false });
    expect(fetchMock.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
  });
});

describe("src.matches", () => {
  it("recognises yandex stream/cache/uri forms and ignores local files", () => {
    expect(src.matches("yandex:123")).toBe(true);
    expect(src.matches("/dev/shm/yandex_music/tracks/123.mp3")).toBe(true);
    expect(src.matches("https://x.storage.yandex.net/get-mp3/a")).toBe(true);
    expect(src.matches("http://127.0.0.1:8767/yandex/stream/123")).toBe(true);
    expect(src.matches("Music/Artist/Album/01.flac")).toBe(false);
  });
});
