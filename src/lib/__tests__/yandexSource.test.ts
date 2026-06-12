// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Track } from "../types";

// Capture MPD commands and feed canned responses. MpdParser is left REAL so the
// position math (parseKeyValue of status/playlistinfo) is exercised end to end.
const sendMock = vi.fn<(cmd: string) => Promise<string>>();
vi.mock("../mpd/client", () => ({
  mpdClient: { send: (cmd: string) => sendMock(cmd) },
}));

const requestMock = vi.fn().mockResolvedValue({});
vi.mock("../yandex", () => ({
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
    yandexContext: writable({ active: false, tracks: [], streamCache: {} }),
    showToast: vi.fn(),
  };
});

import { yandexSource } from "../sources/yandexSource";
import type { TrackSource } from "../sources/trackSource";
import { yandexContext } from "../store";

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
  yandexContext.set({
    active: false,
    tracks: [],
    currentIndex: 0,
    currentTrackId: null,
    currentTrackFile: null,
    streamCache: {},
  });
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
    expect(requestMock).toHaveBeenCalledWith("play_track", { id: "777", append: 1 });
    // The appended track sits at the new last position (lenAfter - 1 = 3); its stable
    // Id is read from playlistinfo and used for move/play — not the raw index.
    expect(sendMock).toHaveBeenCalledWith("playlistinfo 3");
    expect(sendMock).toHaveBeenCalledWith("moveid 42 2"); // targetPos = currentPos + 1
    expect(sendMock).toHaveBeenCalledWith("playid 42");
  });

  it("does NOT move/play when the queue did not grow (append failed / raced)", async () => {
    sendMock.mockResolvedValue("playlistlength: 3\nOK\n"); // before === after === 3

    const handled = await src.playUri("yandex:9", 0);

    expect(handled).toBe(true);
    expect(requestMock).toHaveBeenCalledWith("play_track", { id: "9", append: 1 });
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
      active: true,
      tracks: [],
      currentIndex: 0,
      currentTrackId: null,
      currentTrackFile: null,
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
    expect(result?.isYandex).toBe(true);
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

describe("src.matches", () => {
  it("recognises yandex stream/cache/uri forms and ignores local files", () => {
    expect(src.matches("yandex:123")).toBe(true);
    expect(src.matches("/dev/shm/yandex_music/tracks/123.mp3")).toBe(true);
    expect(src.matches("https://x.storage.yandex.net/get-mp3/a")).toBe(true);
    expect(src.matches("Music/Artist/Album/01.flac")).toBe(false);
  });
});
