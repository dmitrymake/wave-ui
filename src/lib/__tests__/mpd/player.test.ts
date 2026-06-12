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
import { PlayerActions } from "../../mpd/player.js";
import { status, currentSong, queue, isQueueLocked } from "../../store";
import type { MpdStatus, Track } from "../../types";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockSend.mockResolvedValue("");
});

afterEach(() => {
  vi.useRealTimers();
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
