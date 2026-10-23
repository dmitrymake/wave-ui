// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { Track } from "../../types";

interface QueueItem { id: number; trackId: string }
const { device, requestMock, skipMock } = vi.hoisted(() => ({
  device: { rows: [] as QueueItem[], activeId: 40, elapsed: 1, version: 1, playback: "play",
    onPlay: null as ((id: number) => void) | null },
  requestMock: vi.fn(), skipMock: vi.fn().mockResolvedValue({}),
}));
const sendMock = vi.fn();
vi.mock("../../mpd/client", () => ({ mpdClient: { send: (...args: unknown[]) => sendMock(...args), isConnected: true } }));
vi.mock("../../db", () => ({ db: { getFilesMap: vi.fn().mockResolvedValue(new Map()) } }));
vi.mock("../../yandex", () => ({ YANDEX_ENDPOINT: { URL: "/wave-yandex-api.php" },
  YandexApi: { request: requestMock, feedbackSkip: skipMock } }));
vi.mock("../../store", () => ({
  status: writable({}), currentSong: writable({ file: "" }), queue: writable([]), queueVersion: writable(0),
  stations: writable([]), isQueueLocked: writable(false), isQueueLoading: writable(false), queueLoadError: writable(false),
  showToast: vi.fn(), activePlaylistTracks: writable([]), activeMenuTab: writable("library"),
  resetNavigation: vi.fn(), navigateTo: vi.fn(),
}));
vi.mock("../../stores/yandex", () => ({
  yandexContext: writable({ streamCache: {} }), yandexFavorites: writable(new Set()),
  yandexState: writable({ active: true, context_name: "My Vibe" }), yandexAuthStatus: writable(true),
}));

import "../../sources/yandexSource";
import { PlayerActions, startStatusPoller, stopStatusPoller } from "../../playback/player";
import { status, currentSong, queue, queueVersion, isQueueLocked } from "../../store";
import { pendingPlayback } from "../../stores/playback";
import { yandexContext } from "../../stores/yandex";
import { MpdParser } from "../../mpd/parser";

const url = (id: string) => `http://127.0.0.1:8767/yandex/stream/${id}`;
function row(item: QueueItem): string {
  return `file: ${url(item.trackId)}\nId: ${item.id}\nPos: ${device.rows.indexOf(item)}\n`;
}
function serverStatus(): string {
  return `state: ${device.playback}\nsong: ${device.rows.findIndex((item) => item.id === device.activeId)}\nsongid: ${device.activeId}\n` +
    `elapsed: ${device.elapsed}\nduration: 180\nbitrate: 192\nplaylistlength: ${device.rows.length}\nplaylist: ${device.version}\n`;
}
function handleCommand(command: string): Promise<string> {
  if (command === "status") return Promise.resolve(serverStatus());
  if (command === "currentsong") {
    const current = device.rows.find((item) => item.id === device.activeId);
    return Promise.resolve(current ? row(current) : "");
  }
  if (command === "playlistinfo") return Promise.resolve(device.rows.map(row).join(""));
  if (command.startsWith("playlistinfo ")) {
    const item = device.rows[Number(command.split(" ")[1])];
    return Promise.resolve(item ? row(item) : "");
  }
  if (command.startsWith("playlistid ")) {
    const item = device.rows.find((item) => item.id === Number(command.split(" ")[1]));
    return Promise.resolve(item ? row(item) : "");
  }
  if (command === "pause 1") device.playback = "pause";
  if (command === "pause 0") device.playback = "play";
  if (command.startsWith("playid ")) {
    device.playback = "play";
    const id = Number(command.split(" ")[1]);
    if (device.onPlay) device.onPlay(id);
    else device.activeId = id;
  }
  return Promise.resolve("OK\n");
}
function rememberMetadata(): void {
  const streamCache = Object.fromEntries(device.rows.map((item) => [url(item.trackId), {
    id: item.trackId, file: url(item.trackId), title: `Track ${item.trackId}`, artist: "Artist", album: "", time: 180,
    isYandex: true as const,
  }]));
  yandexContext.set({ streamCache });
}
async function boot(): Promise<void> {
  startStatusPoller();
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  requestMock.mockResolvedValue({ status: "ready" });
  sendMock.mockImplementation(handleCommand);
  device.rows = [40, 41, 42, 43].map((id) => ({ id, trackId: String(1000 + id) }));
  device.activeId = 40;
  device.elapsed = 1;
  device.playback = "play";
  device.version = 1;
  device.onPlay = null;
  queue.set([]);
  queueVersion.set(0);
  isQueueLocked.set(false);
  status.set(MpdParser.parseStatus(serverStatus()));
  currentSong.set(MpdParser.parseCurrentSong(row(device.rows[0])));
  rememberMetadata();
});
afterEach(() => {
  stopStatusPoller();
  vi.useRealTimers();
});

describe("stable MPD queue identity during radio pruning", () => {
  it("keeps provider ids separate and never re-resolves a selected row by an obsolete position", async () => {
    await boot();
    expect(get(queue)[1]).toMatchObject({ id: "1041", mpdId: 41 });
    // MPD has already removed a preceding item, but the displayed queue is still
    // the previous snapshot. Position 1 now identifies 42, not selected item 41.
    device.rows = device.rows.slice(1);
    device.version++;
    await PlayerActions.playQueuePosition(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(sendMock).toHaveBeenCalledWith("playid 41");
    expect(sendMock).not.toHaveBeenCalledWith("playlistinfo 1");
    expect(sendMock).not.toHaveBeenCalledWith("playid 42");
  });

  it("releases Loading audio when the selected id moves after playid is acknowledged", async () => {
    await boot();
    device.onPlay = (id) => {
      device.activeId = id;
      device.rows = device.rows.slice(1);
      device.version++;
    };
    await PlayerActions.playQueuePosition(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(device.activeId).toBe(41);
    expect(get(status).song).toBe(0);
    expect(get(pendingPlayback)).toBeNull();
    expect(get(currentSong)).toMatchObject({ id: "1041", mpdId: 41 });
  });

  it("finds next by current id within the queue snapshot instead of mixing queue versions", async () => {
    await boot();
    // Status was updated after pruning, but the displayed queue has not been.
    status.update((value) => ({ ...value, song: 0, songId: 41 }));
    await PlayerActions.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendMock).toHaveBeenCalledWith("playid 42");
    expect(sendMock).not.toHaveBeenCalledWith("playid 41");
  });

  it("does not confuse two queue occurrences of the same provider track", async () => {
    device.rows = [{ id: 40, trackId: "1040" }, { id: 41, trackId: "1041" }, { id: 42, trackId: "1041" }];
    rememberMetadata();
    await boot();
    // While MPD buffers selected occurrence 41, it still reports occurrence 42,
    // with the exact same file/provider id. It must not complete the wrong one.
    device.onPlay = () => { device.activeId = 42; };
    await PlayerActions.playQueuePosition(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(get(pendingPlayback)?.songId).toBe(41);
    device.activeId = 41;
    await vi.advanceTimersByTimeAsync(1000);
    expect(get(pendingPlayback)).toBeNull();
  });

  it("can cancel a stalled preparation and pause physical MPD without a late restart", async () => {
    await boot();
    let ready!: () => void;
    let signal: AbortSignal | undefined;
    requestMock.mockImplementation((action, _params, _method, _timeout, abort?: AbortSignal) => {
      if (action === "prepare_track" && abort) {
        signal = abort;
        return new Promise((resolve) => { ready = () => resolve({ status: "ready" }); });
      }
      return Promise.resolve({ status: "ready" });
    });
    const selection = PlayerActions.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(pendingPlayback)?.phase).toBe("preparing");
    await PlayerActions.togglePlay();
    expect(sendMock).toHaveBeenCalledWith("pause 1");
    expect(device.playback).toBe("pause");
    expect(signal?.aborted).toBe(true);
    expect(get(pendingPlayback)).toBeNull();
    expect(get(currentSong).mpdId).toBe(40);
    ready();
    await selection;
    await vi.advanceTimersByTimeAsync(0);
    expect(sendMock).not.toHaveBeenCalledWith("playid 41");
    expect(get(status).state).toBe("pause");
    expect(get(pendingPlayback)).toBeNull();
  });

  it("rapid next cancels old preparations and advances by id even as positions change", async () => {
    await boot();
    const ready = new Map<string, () => void>();
    const signals: AbortSignal[] = [];
    requestMock.mockImplementation((action, params, _method, _timeout, signal?: AbortSignal) => {
      if (action === "prepare_track" && signal) {
        signals.push(signal);
        return new Promise((resolve) => ready.set(params.track_id, () => resolve({ status: "ready" })));
      }
      return Promise.resolve({ status: "ready" });
    });
    const first = PlayerActions.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(pendingPlayback)?.track.mpdId).toBe(41);
    queue.update((tracks) => tracks.slice(1));
    device.rows = device.rows.slice(1);
    device.version++;
    const second = PlayerActions.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(pendingPlayback)?.track.mpdId).toBe(42);
    expect(signals[0].aborted).toBe(true);
    expect(sendMock.mock.calls.some(([cmd]) => String(cmd).startsWith("playid "))).toBe(false);
    ready.get("1042")!();
    await second;
    ready.get("1041")!();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(sendMock).toHaveBeenCalledWith("playid 42");
    expect(sendMock).not.toHaveBeenCalledWith("playid 41");
    expect(get(pendingPlayback)).toBeNull();
  });
});
