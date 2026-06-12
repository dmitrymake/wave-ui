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
      stationName: null, id: null, pos: null, isYandex: false,
    }),
    stations: writable([]),
    queue: writable([]),
    queueVersion: writable(0),
    isQueueLocked: writable(false),
    showToast: vi.fn(),
    yandexContext: writable({ active: false, tracks: [], streamCache: {} }),
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
import { status, currentSong } from "../../store";
import type { MpdStatus } from "../../types";

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
      { file: "yandex:12345", id: "12345", isYandex: true, title: "t" },
      { file: "yandex:67890", id: "67890", isYandex: true, title: "next" },
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
      { file: "Music/a.flac", id: "0", isYandex: false, title: "local" },
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
