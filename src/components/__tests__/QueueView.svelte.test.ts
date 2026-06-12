// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
//
// Transport component test for the queue view. Mirrors the TrackRow test setup:
// the whole store barrel and the playerActions gateway are mocked at their
// resolved ids, so the entire QueueView -> BaseList -> TrackRow tree mounts
// without the real MPD/IndexedDB stack. The behaviour under test is the riskiest
// optimistic interaction in the queue: a drag-to-reorder that must commit
// PlayerActions.moveTrack(from, to) with the right indices while the list updates
// optimistically.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import { writable } from "svelte/store";
import type { Track } from "../../lib/types";

// --- Store barrel mock -------------------------------------------------------
// QueueView reads queue/status/currentSong/isQueueLocked and the showModal helper
// from the store barrel; BaseList reads navigationStack/activeMenuTab + scroll
// helpers; the TrackRow subtree reads stations/favorites/artwork/context helpers.
// Provide all of them as controllable writables / stubs. `queue` and `status` are
// hoisted so both the mock factory and the test body share the same instance.
const { queue, status, currentSong, isQueueLocked } = vi.hoisted(() => {
  const { writable: w } = require("svelte/store") as typeof import("svelte/store");
  return {
    queue: w<Partial<Track>[]>([]),
    status: w({ state: "stop", song: 0 }),
    currentSong: w<Partial<Track>>({ file: "" }),
    isQueueLocked: w<boolean>(false),
  };
});

vi.mock("../../lib/store", () => ({
  // player domain
  queue,
  status,
  currentSong,
  isQueueLocked,
  // ui domain
  showModal: vi.fn(),
  // navigation domain (BaseList)
  navigationStack: writable([{ view: "queue" }]),
  saveScrollPosition: vi.fn(),
  getScrollPosition: () => 0,
  navigateTo: vi.fn(),
  resetNavigation: vi.fn(),
  // ui domain (TrackRow subtree)
  activeMenuTab: writable("queue"),
  openContextMenu: vi.fn(),
  // library / artwork (TrackRow subtree)
  stations: writable([]),
  favorites: writable<Set<string>>(new Set()),
  getTrackThumbUrl: () => "/images/default_icon.png",
  getTrackCoverUrl: () => "/images/default_cover.png",
}));

// LikeButton (a TrackRow child) reads streaming favourites from its own domain
// module; QueueView also pulls in the sources registry (yandexSource builds its
// daemon banner from yandexState and enriches from yandexContext at module load),
// so all the Yandex-store exports the source touches must be stubbed here.
vi.mock("../../lib/stores/yandex", () => ({
  yandexFavorites: writable<Set<string>>(new Set()),
  yandexContext: writable({ streamCache: {} }),
  yandexState: writable({ active: false, context_name: "" }),
  yandexAuthStatus: writable(false),
}));

// playerActions is the gateway QueueView drives. Capture every action so the
// reorder commit (moveTrack) can be asserted; the rest are no-op spies that just
// have to exist for the import to resolve. `moveTrack` is hoisted so the mock
// factory (hoisted above this point by Vitest) and the test body share one spy.
const { moveTrack } = vi.hoisted(() => ({ moveTrack: vi.fn() }));
vi.mock("../../lib/playerActions", () => ({
  moveTrack,
  playQueuePosition: vi.fn(),
  clearQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  saveQueue: vi.fn(),
  loadPlaylists: vi.fn(),
  togglePlay: vi.fn(),
}));

import QueueView from "../views/QueueView.svelte";

const track = (over: Partial<Track>): Track =>
  ({
    file: "",
    title: "",
    artist: "",
    album: "",
    genre: "",
    time: 0,
    track: "",
    ...over,
  }) as Track;

// A tiny three-track queue. `_uid` is BaseList's #each key.
const makeQueue = (): Track[] => [
  track({ _uid: "a", file: "Music/a.flac", title: "Alpha", artist: "A" }),
  track({ _uid: "b", file: "Music/b.flac", title: "Bravo", artist: "B" }),
  track({ _uid: "c", file: "Music/c.flac", title: "Charlie", artist: "C" }),
];

beforeEach(() => {
  moveTrack.mockClear();
  queue.set(makeQueue());
  status.set({ state: "stop", song: 0 });
  currentSong.set({ file: "" });
  isQueueLocked.set(false);
});

describe("QueueView — render / daemon banner", () => {
  it("renders the queue without the daemon banner when no source daemon is active", () => {
    const { getByText, queryByText, container } = render(QueueView);
    // Default (daemon-inactive) header path: the static "Current Queue" title and
    // the track-count badge render, and no "Daemon Active" badge appears.
    expect(getByText("Current Queue")).toBeInTheDocument();
    expect(getByText("3 tracks")).toBeInTheDocument();
    expect(queryByText("Daemon Active")).toBeNull();
    // All three rows mounted.
    expect(getByText("Alpha")).toBeInTheDocument();
    expect(getByText("Charlie")).toBeInTheDocument();
    expect(container.querySelectorAll(".row").length).toBe(3);
  });

  it("starts in non-edit mode: no drag handles are rendered until Edit is toggled", () => {
    const { container, getByTitle } = render(QueueView);
    expect(container.querySelector(".drag-handle")).toBeNull();
    // Toggling edit mode surfaces a drag handle per row.
    fireEvent.click(getByTitle("Edit Queue"));
    expect(container.querySelectorAll(".drag-handle").length).toBe(3);
  });
});

// Geometry shim: jsdom returns all-zero layout boxes, which collapses the drag
// engine's hover-index math to 0 for every row. Stamp deterministic vertical
// layout onto the list/rows so a pointer dragged to a Y over row index 2 resolves
// to hoverIndex 2. Each row is ROW_H tall, stacked from the top of the list.
const ROW_H = 64;
function stampLayout(container: HTMLElement): { rowTopY: (i: number) => number } {
  const list = container.querySelector(".list-body") as HTMLElement;
  const scroller = container.querySelector(".base-list-scroll-container") as HTMLElement;
  const rows = Array.from(container.querySelectorAll<HTMLElement>(".row-wrapper"));

  const rectAt = (top: number, bottom: number): DOMRect =>
    ({ top, left: 0, bottom, right: 300, width: 300, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  // The list body holds the rows starting at y=0. The scroll container is stamped
  // intentionally tall (well past the 100px auto-scroll edge zone on both sides) so
  // a pointer dragged over a row never trips the auto-scroll rAF loop in jsdom.
  list.getBoundingClientRect = () => rectAt(0, rows.length * ROW_H);
  scroller.getBoundingClientRect = () => rectAt(-1000, 2000);
  rows.forEach((row, i) => {
    // offsetTop/offsetHeight drive calculateHoverIndex' nearest-row search.
    Object.defineProperty(row, "offsetTop", { value: i * ROW_H, configurable: true });
    Object.defineProperty(row, "offsetHeight", { value: ROW_H, configurable: true });
    Object.defineProperty(row, "offsetLeft", { value: 0, configurable: true });
    row.getBoundingClientRect = () => rectAt(i * ROW_H, i * ROW_H + ROW_H);
  });

  return { rowTopY: (i: number) => i * ROW_H + ROW_H / 2 };
}

describe("QueueView — drag-to-reorder commits moveTrack(from, to)", () => {
  it("commits PlayerActions.moveTrack(0, 2) and applies the optimistic order when row 0 is dragged onto row 2", async () => {
    vi.useFakeTimers();
    try {
      const { container, getByTitle } = render(QueueView);

      // Enter edit mode so drag handles render.
      await fireEvent.click(getByTitle("Edit Queue"));
      await tick();

      const { rowTopY } = stampLayout(container);
      const handles = container.querySelectorAll<HTMLElement>(".drag-handle");
      expect(handles.length).toBe(3);

      // Grab row 0's handle. onDragInit reads the *index-th* .row-wrapper inside the
      // scroll container, so the geometry stamped above defines the grab box.
      await fireEvent.mouseDown(handles[0], { clientX: 10, clientY: rowTopY(0), button: 0 });

      // Move past the 3px drag threshold and down to the centre of row index 2.
      // BaseList listens on window for mousemove/mouseup.
      await fireEvent(window, new MouseEvent("mousemove", { clientX: 10, clientY: rowTopY(2), cancelable: true }));
      await fireEvent(window, new MouseEvent("mouseup", { clientX: 10, clientY: rowTopY(2) }));

      // commitDrop awaits a 250ms timeout, then a tick, then the reorder. Drive the
      // fake clock past it and flush the microtasks/animation frames it awaits.
      await vi.advanceTimersByTimeAsync(300);
      await tick();

      expect(moveTrack).toHaveBeenCalledTimes(1);
      expect(moveTrack).toHaveBeenCalledWith(0, 2);

      // Optimistic store reorder: the engine splices the list before the network
      // round-trip, so Alpha moved to the end.
      const titles = Array.from(container.querySelectorAll(".row .title")).map((n) => n.textContent);
      expect(titles).toEqual(["Bravo", "Charlie", "Alpha"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not commit a move when the pointer never crosses the drag threshold (a plain click)", async () => {
    vi.useFakeTimers();
    try {
      const { container, getByTitle } = render(QueueView);
      await fireEvent.click(getByTitle("Edit Queue"));
      await tick();
      stampLayout(container);

      const handle = container.querySelector<HTMLElement>(".drag-handle")!;
      // Down then up with no intervening move: onPointerUp sees isDragging=false and
      // cancels the drag without committing.
      await fireEvent.mouseDown(handle, { clientX: 10, clientY: 32, button: 0 });
      await fireEvent(window, new MouseEvent("mouseup", { clientX: 10, clientY: 32 }));
      await vi.advanceTimersByTimeAsync(300);
      await tick();

      expect(moveTrack).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
