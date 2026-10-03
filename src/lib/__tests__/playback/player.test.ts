// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

// Mock mpdClient
const mockSend = vi.fn().mockResolvedValue("");

vi.mock("../../mpd/client", () => ({
  mpdClient: {
    send: (...args: string[]) => mockSend(...args),
    get isConnected() { return true; },
    isProcessing: false,
  },
}));

vi.mock("../../mpd/parser", () => ({
  MpdParser: {
    parseStatus: vi.fn().mockReturnValue({
      state: "stop",
      volume: 50,
      elapsed: 0,
      duration: 0,
      random: false,
      repeat: false,
      song: 0,
      songId: -1,
      playlistLength: 0,
      bitrate: 0,
      format: "",
      playlistVersion: 0,
    }),
    parseCurrentSong: vi.fn().mockReturnValue({
      file: "",
      title: "Not Playing",
      artist: "",
      album: "",
      genre: "",
      time: 0,
      track: "",
      id: undefined,
      pos: null,
      stationName: null,
    }),
    parseTracks: vi.fn().mockReturnValue([]),
    parseKeyValue: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("../../store", () => {
  const { writable } = require("svelte/store");
  return {
    status: writable({
      state: "stop", volume: 50, elapsed: 0, duration: 0,
      random: false, repeat: false, bitrate: 0, format: "",
      song: 0, songid: 0,
    }),
    currentSong: writable({
      title: "Not Playing", artist: "", album: "", file: "",
      stationName: null, id: null, pos: null,
    }),
    stations: writable([]),
    queue: writable([]),
    queueVersion: writable(0),
    isQueueLocked: writable(false),
    isQueueLoading: writable(false),
    queueLoadError: writable(false),
    showToast: vi.fn(),
    activeMenuTab: writable("library"),
    navigationStack: writable([]),
  };
});

// Yandex stores now live in their own domain module; the imported yandexSource
// reads them from "../../stores/yandex" (no longer re-exported by the shared
// barrel), so the stubs must be wired here.
vi.mock("../../stores/yandex", () => {
  const { writable } = require("svelte/store");
  return {
    yandexContext: writable({ streamCache: {} }),
    yandexFavorites: writable(new Set()),
    yandexState: writable({ active: false, context_name: "" }),
    yandexAuthStatus: writable(false),
  };
});

vi.mock("../../db", () => ({
  db: { getFilesMap: vi.fn().mockResolvedValue(new Map()) },
}));

vi.mock("../../api", () => ({
  ApiActions: {
    getYandexMeta: vi.fn().mockResolvedValue(null),
    batchGetYandexMeta: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../../yandex", () => ({
  YandexApi: {
    request: vi.fn().mockResolvedValue({}),
    feedbackSkip: vi.fn().mockResolvedValue({}),
  },
}));

// Registering the Yandex source lets resolveSource() route Yandex tracks in tests.
import "../../sources/yandexSource";
import { PlayerActions, startStatusPoller, stopStatusPoller } from "../../playback/player.js";
import { status, currentSong, queue, queueVersion, isQueueLocked, isQueueLoading, queueLoadError } from "../../store";
import type { MpdStatus, Track } from "../../types";
import { registerTrackSource } from "../../sources/trackSource";
import { yandexSource } from "../../sources/yandexSource";
import { MpdParser } from "../../mpd/parser";
import { pendingPlayback } from "../../stores/playback";
import { db } from "../../db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockSend.mockResolvedValue("");
  queue.set([]);
  queueVersion.set(0);
  isQueueLocked.set(false);
  isQueueLoading.set(false);
  queueLoadError.set(false);
  status.set({ state: "stop", volume: 50, elapsed: 0, duration: 0, song: 0, songId: -1,
    random: false, repeat: false, playlistLength: 0, playlistVersion: 0, bitrate: 0, format: "" });
});

afterEach(() => {
  stopStatusPoller();
  vi.useRealTimers();
});

describe("queue loading", () => {
  const baseStatus = MpdParser.parseStatus("");
  const baseTracks = MpdParser.parseTracks("");
  const track: Track = { file: "music/song.mp3", title: "Song", artist: "Artist", album: "", genre: "", track: "", time: 180, id: "1" };

  beforeEach(() => {
    vi.mocked(MpdParser.parseStatus).mockReturnValue({ ...baseStatus, playlistLength: 1, playlistVersion: 10 });
    vi.mocked(MpdParser.parseTracks).mockReturnValue([track]);
    vi.mocked(db.getFilesMap).mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.mocked(MpdParser.parseStatus).mockReturnValue(baseStatus);
    vi.mocked(MpdParser.parseTracks).mockReturnValue(baseTracks);
    vi.mocked(db.getFilesMap).mockResolvedValue(new Map());
  });

  it("loads an empty snapshot once without overlapping playlist requests", async () => {
    let finish!: (text: string) => void;
    const playlist = new Promise<string>((resolve) => { finish = resolve; });
    mockSend.mockImplementation((command: string) => command === "playlistinfo" ? playlist : Promise.resolve(""));
    startStatusPoller();
    expect(get(isQueueLoading)).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockSend.mock.calls.filter(([command]) => command === "playlistinfo")).toHaveLength(1);
    expect(get(isQueueLoading)).toBe(true);
    finish("");
    await vi.advanceTimersByTimeAsync(0);
    expect(get(queue)).toMatchObject([track]);
    expect(get(isQueueLoading)).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(get(isQueueLoading)).toBe(false);
    expect(mockSend.mock.calls.filter(([command]) => command === "playlistinfo")).toHaveLength(1);
  });

  it("keeps an existing queue visible during a later synchronization", async () => {
    queue.set([track]);
    mockSend.mockImplementation((command: string) => command === "playlistinfo" ? new Promise<string>(() => {}) : Promise.resolve(""));
    startStatusPoller();
    await vi.advanceTimersByTimeAsync(2000);
    expect(get(queue)).toMatchObject([track]);
    expect(get(isQueueLoading)).toBe(false);
  });

  it("settles to the empty state when MPD has no tracks", async () => {
    vi.mocked(MpdParser.parseStatus).mockReturnValue(baseStatus);
    startStatusPoller();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(queue)).toEqual([]);
    expect(get(isQueueLoading)).toBe(false);
    expect(get(queueLoadError)).toBe(false);
    expect(mockSend).not.toHaveBeenCalledWith("playlistinfo");
  });

  it("releases the skeleton on sync failure and recovers on the next poll", async () => {
    let failed = true;
    mockSend.mockImplementation((command: string) => command === "playlistinfo" && failed
      ? Promise.reject(new Error("Connection lost")) : Promise.resolve(""));
    startStatusPoller();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(isQueueLoading)).toBe(false);
    expect(get(queueLoadError)).toBe(true);
    expect(get(queue)).toEqual([]);
    failed = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(get(queue)).toMatchObject([track]);
    expect(get(queueLoadError)).toBe(false);
    expect(get(isQueueLoading)).toBe(false);
  });

  it("releases the initial skeleton when status refresh fails", async () => {
    mockSend.mockRejectedValue(new Error("Connection lost"));
    startStatusPoller();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(isQueueLoading)).toBe(false);
    expect(get(queueLoadError)).toBe(true);
  });

  it("bounds the initial skeleton if the MPD connection never responds", async () => {
    mockSend.mockImplementation(() => new Promise<string>(() => {}));
    startStatusPoller();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(get(isQueueLoading)).toBe(false);
    expect(get(queueLoadError)).toBe(true);
  });

  it("renders the MPD snapshot when IndexedDB hydration remains blocked", async () => {
    vi.mocked(db.getFilesMap).mockImplementation(() => new Promise(() => {}));
    startStatusPoller();
    await vi.advanceTimersByTimeAsync(5000);
    expect(get(queue)).toMatchObject([track]);
    expect(get(isQueueLoading)).toBe(false);
    expect(get(queueLoadError)).toBe(false);
  });

  it("retries a queue synchronization that exceeded its deadline without flashing skeletons", async () => {
    let stalled = true;
    mockSend.mockImplementation((command: string) => command === "playlistinfo" && stalled
      ? new Promise<string>(() => {}) : Promise.resolve(""));
    startStatusPoller();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(get(isQueueLoading)).toBe(false);
    expect(get(queueLoadError)).toBe(true);
    stalled = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(get(queue)).toMatchObject([track]);
    expect(get(queueLoadError)).toBe(false);
    expect(get(isQueueLoading)).toBe(false);
  });

  it("does not publish a stale hydration result after polling is stopped", async () => {
    let hydrate!: (map: Map<string, Track>) => void;
    vi.mocked(db.getFilesMap).mockImplementation(() => new Promise((resolve) => { hydrate = resolve; }));
    startStatusPoller();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(isQueueLoading)).toBe(true);
    stopStatusPoller();
    hydrate(new Map());
    await vi.advanceTimersByTimeAsync(0);
    expect(get(queue)).toEqual([]);
    expect(get(isQueueLoading)).toBe(false);
  });

  it("shows numeric Yandex cache files as pending until their metadata request finishes", async () => {
    let finish!: () => void;
    const fetch = vi.spyOn(yandexSource, "fetchQueueMeta").mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    vi.mocked(MpdParser.parseTracks).mockReturnValue([{ ...track, file: "/dev/shm/yandex_music/tracks/4649437.mp3", title: "4649437.mp3", artist: "Unknown Artist" }]);
    try {
      startStatusPoller();
      await vi.advanceTimersByTimeAsync(0);
      expect(get(queue)[0]).toMatchObject({ title: "", artist: "", service: "yandex", isMetadataPending: true });
      expect(get(isQueueLoading)).toBe(false);
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(get(queue)[0]).toMatchObject({ title: "4649437.mp3", artist: "Unknown Artist", isMetadataPending: false });
    } finally {
      fetch.mockRestore();
    }
  });

  it("releases pending rows even when their source never finishes", async () => {
    const fetch = vi.spyOn(yandexSource, "fetchQueueMeta").mockImplementation(() => new Promise<void>(() => {}));
    vi.mocked(MpdParser.parseTracks).mockReturnValue([{ ...track, file: "yandex:999001" }]);
    try {
      startStatusPoller();
      await vi.advanceTimersByTimeAsync(0);
      expect(get(queue)[0].isMetadataPending).toBe(true);
      await vi.advanceTimersByTimeAsync(125_000);
      expect(get(queue)[0]).toMatchObject({ title: "yandex:999001", artist: "Unknown Artist", isMetadataPending: false });
    } finally {
      fetch.mockRestore();
    }
  });
});

describe("metadata in a mixed streaming queue", () => {
  it("dispatches each missing file to its owning source", async () => {
    const otherFetch = vi.fn();
    const yandexFetch = vi.spyOn(yandexSource, "fetchQueueMeta").mockImplementation(() => {});
    registerTrackSource({
      id: "other-test-stream",
      matches: (file) => file.startsWith("https://other.test/"),
      enrichQueueTrack: (track, missing) => { missing.push(track.file); return null; },
      fetchQueueMeta: otherFetch,
    });
    const previousStatus = MpdParser.parseStatus("");
    const previousTracks = MpdParser.parseTracks("");
    vi.mocked(MpdParser.parseStatus).mockReturnValue({ ...previousStatus, playlistLength: 2, playlistVersion: 50 });
    const base = { title: "", artist: "", album: "", genre: "", track: "", time: 0 };
    vi.mocked(MpdParser.parseTracks).mockReturnValue([
      { ...base, file: "https://storage.yandex.net/get-mp3?id=123", id: "1" },
      { ...base, file: "https://other.test/song", id: "2" },
    ]);
    queue.set([]);
    try {
      startStatusPoller();
      await vi.waitFor(() => expect(otherFetch).toHaveBeenCalledWith(["https://other.test/song"]));
      expect(yandexFetch).toHaveBeenCalledWith(["https://storage.yandex.net/get-mp3?id=123"]);
    } finally {
      stopStatusPoller();
      yandexFetch.mockRestore();
      vi.mocked(MpdParser.parseStatus).mockReturnValue(previousStatus);
      vi.mocked(MpdParser.parseTracks).mockReturnValue(previousTracks);
    }
  });
});

describe("pending playback selection", () => {
  it("shows the selected title immediately and keeps it while MPD still reports the old song", async () => {
    let resolve!: () => void;
    const ready = new Promise<void>((done) => { resolve = done; });
    registerTrackSource({ id: "pending-playback-test", matches: (uri) => uri.startsWith("https://pending-playback.test/"),
      prepareUri: () => ready, playUri: async () => true });
    startStatusPoller();
    const uri = "https://pending-playback.test/song";
    const action = PlayerActions.playUri(uri, { title: "Selected song", artist: "Artist", image: "https://example.test/art.jpg", time: 204 });
    expect(get(currentSong)).toMatchObject({ title: "Selected song", artist: "Artist", file: uri });
    expect(get(pendingPlayback)?.phase).toBe("preparing");
    await vi.advanceTimersByTimeAsync(1000);
    expect(get(currentSong).title).toBe("Selected song");
    expect(get(pendingPlayback)?.track.file).toBe(uri);
    resolve();
    await action;
  });

  it("does not start an earlier selection after a newer one has been requested", async () => {
    let resolveOld!: () => void;
    const old = new Promise<void>((done) => { resolveOld = done; });
    const play = vi.fn(async (_uri: string) => true);
    registerTrackSource({ id: "playback-race-test", matches: (uri) => uri.startsWith("https://playback-race.test/"),
      prepareUri: (uri) => uri.endsWith("old") ? old : Promise.resolve(), playUri: play });
    const first = PlayerActions.playUri("https://playback-race.test/old", { title: "Old selection" });
    await PlayerActions.playUri("https://playback-race.test/new", { title: "Latest selection" });
    resolveOld();
    await first;
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0]?.[0]).toBe("https://playback-race.test/new");
    expect(get(currentSong).title).toBe("Latest selection");
  });
});

describe("progress bar while the track is still buffering", () => {
  it("freezes the local elapsed instead of running ahead and snapping back", async () => {
    const defaultStatus = MpdParser.parseStatus("");
    const defaultSong = MpdParser.parseCurrentSong("");
    let serverElapsed = 0;
    vi.mocked(MpdParser.parseStatus).mockImplementation(() => ({ ...defaultStatus,
      state: "play", elapsed: serverElapsed, duration: 100, song: 0, songId: 1,
      playlistLength: 1, playlistVersion: 1, bitrate: 320 } as MpdStatus));
    vi.mocked(MpdParser.parseCurrentSong).mockImplementation(() => ({ ...defaultSong,
      file: "music/song.mp3", title: "Buffering song", time: 100, id: "1", pos: "0" }));

    const samples: number[] = [];
    const unsubscribe = status.subscribe((s) => samples.push(s.elapsed));

    try {
      startStatusPoller();
      await vi.advanceTimersByTimeAsync(1); // initial hard sync: elapsed 0, ticker on

      // MPD already reports "play" but the decoder is still loading the track:
      // the server elapsed stays at 0 while polls keep coming.
      await vi.advanceTimersByTimeAsync(5000);
      const frozen = get(status).elapsed;
      expect(frozen).toBeGreaterThan(0); // never snapped back to the server's 0
      await vi.advanceTimersByTimeAsync(2000);
      expect(get(status).elapsed).toBeCloseTo(frozen, 5); // frozen, not marching on

      // Audio finally starts: the server position advances again.
      for (let i = 0; i < 4; i++) {
        serverElapsed += 1;
        await vi.advanceTimersByTimeAsync(1000);
      }

      // The bar only ever moved forward — no rollback at any point.
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-6);
      }
    } finally {
      unsubscribe();
      vi.mocked(MpdParser.parseStatus).mockReturnValue(defaultStatus);
      vi.mocked(MpdParser.parseCurrentSong).mockReturnValue(defaultSong);
    }
  });
});

describe("PlayerActions.togglePlay", () => {
  it("sends pause when playing", async () => {
    status.set({ state: "play", volume: 50, elapsed: 10, duration: 100, random: false, repeat: false } as MpdStatus);
    await PlayerActions.togglePlay();
    expect(mockSend).toHaveBeenCalledWith("pause 1");
  });

  it("sends play when stopped", async () => {
    status.set({ state: "stop", volume: 50, elapsed: 0, duration: 0, random: false, repeat: false } as MpdStatus);
    await PlayerActions.togglePlay();
    expect(mockSend).toHaveBeenCalledWith("play");
  });
});

describe("PlayerActions optimistic rollback on dead socket", () => {
  it("togglePlay swallows no errors but resolves when send rejects", async () => {
    status.set({ state: "stop", volume: 50, elapsed: 0, duration: 0, random: false, repeat: false } as MpdStatus);
    // The transport command fails (e.g. socket closed mid-flight). The action must
    // settle (not reject up to the click handler) and attempt a reconciling refresh.
    mockSend.mockRejectedValueOnce(new Error("Connection lost"));

    await expect(PlayerActions.togglePlay()).resolves.toBeUndefined();

    // The first call is the failed "play"; the rollback then re-syncs via "status".
    expect(mockSend).toHaveBeenCalledWith("play");
    expect(mockSend).toHaveBeenCalledWith("status");
  });

  it("setVolume settles when send rejects", async () => {
    mockSend.mockRejectedValueOnce(new Error("Connection lost"));
    await expect(PlayerActions.setVolume(40)).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledWith("setvol 40");
  });

  it("seek settles when send rejects", async () => {
    status.set({ state: "play", elapsed: 0, duration: 100 } as MpdStatus);
    mockSend.mockRejectedValueOnce(new Error("Connection lost"));
    await expect(PlayerActions.seek(20)).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledWith("seekcur 20");
  });
});

describe("PlayerActions.next / previous", () => {
  it("sends next command", async () => {
    await PlayerActions.next();
    expect(mockSend).toHaveBeenCalledWith("next");
  });

  it("sends previous command", async () => {
    await PlayerActions.previous();
    expect(mockSend).toHaveBeenCalledWith("previous");
  });

  it("resets elapsed on next", async () => {
    status.set({ state: "play", elapsed: 50, duration: 100 } as MpdStatus);
    await PlayerActions.next();
    expect(get(status).elapsed).toBe(0);
  });
});

describe("PlayerActions.next Yandex feedback", () => {
  it("fires feedbackSkip when current track is Yandex", async () => {
    const { queue: queueStore } = await import("../../store");
    const { YandexApi } = await import("../../yandex");

    (queueStore as unknown as { set: (v: unknown) => void }).set([
      { file: "yandex:12345", id: "12345", service: "yandex", title: "t" },
      { file: "yandex:67890", id: "67890", service: "yandex", title: "next" },
    ]);
    status.set({ state: "play", elapsed: 42, duration: 180, song: 0 } as MpdStatus);

    await PlayerActions.next();

    expect(YandexApi.feedbackSkip).toHaveBeenCalledTimes(1);
    expect(YandexApi.feedbackSkip).toHaveBeenCalledWith("12345", 42);
  });

  it("does not fire feedbackSkip when current track is not Yandex", async () => {
    const { queue: queueStore } = await import("../../store");
    const { YandexApi } = await import("../../yandex");

    (queueStore as unknown as { set: (v: unknown) => void }).set([
      { file: "Music/a.flac", id: "0", title: "local" },
    ]);
    status.set({ state: "play", elapsed: 10, duration: 180, song: 0 } as MpdStatus);

    await PlayerActions.next();

    expect(YandexApi.feedbackSkip).not.toHaveBeenCalled();
  });
});

describe("PlayerActions.setVolume", () => {
  it("sends setvol command", async () => {
    await PlayerActions.setVolume(75);
    expect(mockSend).toHaveBeenCalledWith("setvol 75");
    expect(get(status).volume).toBe(75);
  });
});

describe("PlayerActions.seek", () => {
  it("sends seekcur command", async () => {
    await PlayerActions.seek(30);
    expect(mockSend).toHaveBeenCalledWith("seekcur 30");
    expect(get(status).elapsed).toBe(30);
  });
});

describe("PlayerActions.toggleRandom", () => {
  it("toggles random on", async () => {
    status.set({ state: "play", random: false, repeat: false } as MpdStatus);
    await PlayerActions.toggleRandom();
    expect(mockSend).toHaveBeenCalledWith("random 1");
    expect(get(status).random).toBe(true);
  });

  it("toggles random off", async () => {
    status.set({ state: "play", random: true, repeat: false } as MpdStatus);
    await PlayerActions.toggleRandom();
    expect(mockSend).toHaveBeenCalledWith("random 0");
  });
});

describe("PlayerActions.toggleRepeat", () => {
  it("toggles repeat on", async () => {
    status.set({ state: "play", random: false, repeat: false } as MpdStatus);
    await PlayerActions.toggleRepeat();
    expect(mockSend).toHaveBeenCalledWith("repeat 1");
    expect(get(status).repeat).toBe(true);
  });
});

describe("PlayerActions.addToQueue", () => {
  it("sends add command for local file", async () => {
    await PlayerActions.addToQueue("Music/track.flac");
    expect(mockSend).toHaveBeenCalledWith('add "Music/track.flac"');
  });
});

describe("PlayerActions.removeFromQueue", () => {
  it("sends delete command", async () => {
    await PlayerActions.removeFromQueue(5);
    expect(mockSend).toHaveBeenCalledWith("delete 5");
  });

  it("optimistically removes the track on success", async () => {
    queue.set([
      { file: "a" }, { file: "b" }, { file: "c" },
    ] as unknown as Track[]);

    await PlayerActions.removeFromQueue(1);

    expect(get(queue).map((t) => t.file)).toEqual(["a", "c"]);
  });

  it("restores the queue when MPD rejects the delete", async () => {
    queue.set([
      { file: "a" }, { file: "b" }, { file: "c" },
    ] as unknown as Track[]);
    mockSend.mockRejectedValueOnce(new Error("MPD delete failed"));

    await PlayerActions.removeFromQueue(1);

    // Rolled back to the original order, not left short (which would desync
    // subsequent index-based operations against MPD).
    expect(get(queue).map((t) => t.file)).toEqual(["a", "b", "c"]);
  });
});

describe("PlayerActions.moveTrack", () => {
  it("sends move command", async () => {
    await PlayerActions.moveTrack(2, 5);
    expect(mockSend).toHaveBeenCalledWith("move 2 5");
  });

  it("does nothing for same position", async () => {
    await PlayerActions.moveTrack(3, 3);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("PlayerActions.clearQueue", () => {
  it("optimistically empties the queue and sends clear on success", async () => {
    queue.set([{ file: "a" }, { file: "b" }] as unknown as Track[]);

    await PlayerActions.clearQueue();

    expect(mockSend).toHaveBeenCalledWith("clear");
    expect(get(queue)).toEqual([]);
  });

  it("restores the queue and unlocks when MPD rejects clear", async () => {
    queue.set([{ file: "a" }, { file: "b" }] as unknown as Track[]);
    isQueueLocked.set(false);
    mockSend.mockRejectedValueOnce(new Error("MPD clear failed"));

    await PlayerActions.clearQueue();

    // Rolled back so the view never lies about an empty queue while the server
    // still holds tracks, and the lock is released immediately on failure.
    expect(get(queue).map((t) => t.file)).toEqual(["a", "b"]);
    expect(get(isQueueLocked)).toBe(false);
  });

  it("locks the queue during the wipe and unlocks after the poll-guard timer", async () => {
    queue.set([{ file: "a" }] as unknown as Track[]);
    isQueueLocked.set(false);

    await PlayerActions.clearQueue();

    // Locked so the 1s status poller cannot race the optimistic wipe and
    // repopulate the view from a stale playlistinfo snapshot...
    expect(get(isQueueLocked)).toBe(true);
    // ...and released once the reconciliation window passes.
    vi.advanceTimersByTime(1000);
    expect(get(isQueueLocked)).toBe(false);
  });
});

// The gateway methods source plugins (e.g. Yandex) drive their MPD through, instead
// of touching mpdClient directly. parseKeyValue is mocked in this file, so set its
// return per-case to drive the parse step.
describe("PlayerActions queue gateway", () => {
  it("getQueueLength reads playlistlength from status", async () => {
    const { MpdParser } = await import("../../mpd/parser");
    (MpdParser.parseKeyValue as ReturnType<typeof vi.fn>).mockReturnValueOnce({ playlistlength: "7" });

    const len = await PlayerActions.getQueueLength();

    expect(mockSend).toHaveBeenCalledWith("status");
    expect(len).toBe(7);
  });

  it("getQueueItemIdAt requests playlistinfo for the position and parses its id", async () => {
    const { MpdParser } = await import("../../mpd/parser");
    (MpdParser.parseKeyValue as ReturnType<typeof vi.fn>).mockReturnValueOnce({ id: "123" });

    const id = await PlayerActions.getQueueItemIdAt(4);

    expect(mockSend).toHaveBeenCalledWith("playlistinfo 4");
    expect(id).toBe(123);
  });

  it("moveById sends moveid with the song id and target position", async () => {
    await PlayerActions.moveById(55, 2);
    expect(mockSend).toHaveBeenCalledWith("moveid 55 2");
  });

  it("playById sends playid with the song id", async () => {
    await PlayerActions.playById(88);
    expect(mockSend).toHaveBeenCalledWith("playid 88");
  });
});
