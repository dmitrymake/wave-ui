// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { tick } from "svelte";
import type { Track } from "../types";

vi.mock("../store", () => ({
  queue: writable<Track[]>([]),
  isQueueLocked: writable(false),
  isQueueLoading: writable(false),
  queueLoadError: writable(false),
  currentSong: writable({ file: "" }),
  status: writable({ song: -1, state: "stop" }),
  navigationStack: writable([{ view: "root" }]),
  activeMenuTab: writable("queue"),
  stations: writable([]),
  favorites: writable(new Set()),
  saveScrollPosition: vi.fn(),
  getScrollPosition: () => 0,
  getTrackThumbUrl: () => "/images/default_icon.png",
  getTrackCoverUrl: () => "/images/default_cover.png",
  showModal: vi.fn(),
  openContextMenu: vi.fn(),
  navigateTo: vi.fn(),
  resetNavigation: vi.fn(),
}));
vi.mock("../sources", () => ({ getActiveDaemon: () => null }));
vi.mock("../playerActions", () => ({
  playQueuePosition: vi.fn(), clearQueue: vi.fn(), removeFromQueue: vi.fn(),
  moveTrack: vi.fn(), saveQueue: vi.fn(), loadPlaylists: vi.fn(), togglePlay: vi.fn(),
}));

import QueueView from "../../components/views/QueueView.svelte";
import { queue, isQueueLoading, queueLoadError } from "../store";

beforeEach(() => {
  queue.set([]);
  isQueueLoading.set(false);
  queueLoadError.set(false);
});

describe("QueueView loading states", () => {
  it("shows initial list skeletons and resolves to the normal empty state", async () => {
    isQueueLoading.set(true);
    const { container, queryByText, getByText } = render(QueueView);
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(10);
    expect(queryByText("Queue is empty")).not.toBeInTheDocument();
    isQueueLoading.set(false);
    await tick();
    expect(container.querySelector(".skeleton-row")).toBeNull();
    expect(getByText("Queue is empty")).toBeInTheDocument();
  });

  it("renders sync failures using the existing empty-list message", () => {
    queueLoadError.set(true);
    const { container, getByText } = render(QueueView);
    expect(getByText("Could not load queue. Retrying…")).toHaveClass("empty-text");
    expect(container.querySelector(".skeleton-row")).toBeNull();
  });

  it("never hides an already-displayed queue behind list skeletons", () => {
    queue.set([{ file: "Music/song.mp3", title: "Song", artist: "Artist", album: "", genre: "", track: "", time: 180 }]);
    isQueueLoading.set(true);
    const { container, getByText } = render(QueueView);
    expect(getByText("Song")).toBeInTheDocument();
    expect(container.querySelector(".skeleton-row")).toBeNull();
  });
});
