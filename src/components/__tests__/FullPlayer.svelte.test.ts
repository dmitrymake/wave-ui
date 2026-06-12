// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
//
// Transport component test for FullPlayer's seek wiring. The store barrel and the
// playerActions gateway are mocked at their resolved ids (mirroring the TrackRow
// test) so the player mounts without the real MPD stack. The behaviour under test:
// the rendered progress bar drives createSeekController's pointer flow (down ->
// move -> up) and commits PlayerActions.seek(fraction * duration), while the
// displayed elapsed time tracks the optimistic drag position mid-gesture.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import { writable } from "svelte/store";
import type { Track } from "../../lib/types";

// --- Store barrel mock -------------------------------------------------------
// FullPlayer reads currentSong/status/stations + getTrackCoverUrl from the barrel;
// its children (VolumeSlider, PlayModeButton, LikeButton, ImageLoader) pull
// status/favorites/artwork too. Provide controllable writables + stubs. status and
// currentSong are hoisted so the test body and the mock share one instance.
const { status, currentSong } = vi.hoisted(() => {
  const { writable: w } = require("svelte/store") as typeof import("svelte/store");
  return {
    status: w({
      state: "play",
      duration: 200,
      elapsed: 50,
      volume: 40,
      random: false,
      repeat: false,
      bitrate: 0,
      format: "",
    }),
    currentSong: w<Partial<Track>>({ file: "Music/song.flac", title: "Song", artist: "Artist" }),
  };
});

vi.mock("../../lib/store", () => ({
  status,
  currentSong,
  stations: writable([]),
  isFullPlayerOpen: writable(true),
  favorites: writable<Set<string>>(new Set()),
  getTrackCoverUrl: () => "/images/default_cover.png",
  getTrackThumbUrl: () => "/images/default_icon.png",
}));

vi.mock("../../lib/stores/yandex", () => ({
  yandexFavorites: writable<Set<string>>(new Set()),
}));

// playerActions gateway. `seek` is the commit target under test; the rest are
// no-op spies the transport buttons reference. `seek` is hoisted so the mock
// factory (hoisted above this point by Vitest) and the test body share one spy.
const { seek } = vi.hoisted(() => ({ seek: vi.fn() }));
vi.mock("../../lib/playerActions", () => ({
  seek,
  nav: vi.fn(),
  togglePlay: vi.fn(),
  setVolume: vi.fn(),
  PlayMode: { toggleRandom: vi.fn(), toggleRepeat: vi.fn() },
}));

import FullPlayer from "../FullPlayer.svelte";

// Stamp a deterministic box onto the seek bar so getPct (clientX - left) / width is
// a clean fraction in jsdom, where every layout box is otherwise zero.
const BAR_LEFT = 0;
const BAR_WIDTH = 200;
function stampBar(container: HTMLElement): HTMLElement {
  const bar = container.querySelector(".bar-hit-area") as HTMLElement;
  bar.getBoundingClientRect = () =>
    ({
      left: BAR_LEFT,
      right: BAR_LEFT + BAR_WIDTH,
      width: BAR_WIDTH,
      top: 0,
      bottom: 40,
      height: 40,
      x: BAR_LEFT,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return bar;
}

beforeEach(() => {
  seek.mockClear();
  status.set({
    state: "play",
    duration: 200,
    elapsed: 50,
    volume: 40,
    random: false,
    repeat: false,
    bitrate: 0,
    format: "",
  });
  currentSong.set({ file: "Music/song.flac", title: "Song", artist: "Artist" });
});

describe("FullPlayer — render / transport controls", () => {
  it("renders the playing track and a seek slider reflecting elapsed/duration", () => {
    const { getByText, container } = render(FullPlayer);
    expect(getByText("Song")).toBeInTheDocument();
    expect(getByText("Artist")).toBeInTheDocument();

    const bar = container.querySelector(".bar-hit-area");
    expect(bar).not.toBeNull();
    // Idle slider shows playback position: elapsed 50 / duration 200 => 25%.
    expect(bar).toHaveAttribute("aria-valuenow", "25");

    // Time row: current elapsed (0:50) and total duration (3:20).
    const times = Array.from(container.querySelectorAll(".time-row span")).map((n) => n.textContent);
    expect(times).toEqual(["0:50", "3:20"]);
  });
});

describe("FullPlayer — seek pointer flow commits seek(fraction * duration)", () => {
  it("commits seek(150) and previews the optimistic time when the bar is dragged to 75%", async () => {
    const { container } = render(FullPlayer);
    const bar = stampBar(container);

    // pointer-down at 75% of the bar => fraction 0.75.
    await fireEvent.mouseDown(bar, { clientX: BAR_LEFT + BAR_WIDTH * 0.75 });
    await tick();

    // Mid-drag the time row reflects the drag preview (0.75 * 200 = 150s => 2:30),
    // not the live elapsed (0:50).
    const elapsedSpan = container.querySelector(".time-row span") as HTMLElement;
    expect(elapsedSpan.textContent).toBe("2:30");
    // And the fill width tracks the drag fraction.
    expect(bar).toHaveAttribute("aria-valuenow", "75");

    // The drag move/up handlers are only wired while dragging; after the reactive
    // re-render above they are attached. Move to 50%, then release to commit.
    await fireEvent.mouseMove(bar, { clientX: BAR_LEFT + BAR_WIDTH * 0.5 });
    await tick();
    expect(container.querySelector(".time-row span")?.textContent).toBe("1:40"); // 0.5 * 200

    await fireEvent.mouseUp(bar);
    await tick();

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(100); // last fraction 0.5 * duration 200

    // After release the slider falls back to live playback position (25%).
    expect(bar).toHaveAttribute("aria-valuenow", "25");
  });

  it("commits the touch position on touchend (touch flow)", async () => {
    const { container } = render(FullPlayer);
    const bar = stampBar(container);

    // touchstart at 75% begins the drag (preview 2:30, distinct from the idle 0:50
    // so the optimistic drag display is unambiguously under test); touchend commits
    // 0.75 * 200 = 150. `bubbles: true` mirrors real browser touch events — jsdom
    // only delivers the manually-constructed event to the bar's handler when it is
    // a bubbling event (native touchstart/touchend always bubble).
    await fireEvent(
      bar,
      new TouchEvent("touchstart", {
        bubbles: true,
        touches: [{ clientX: BAR_LEFT + BAR_WIDTH * 0.75 } as Touch],
      }),
    );
    await tick();
    expect(container.querySelector(".time-row span")?.textContent).toBe("2:30");

    await fireEvent(bar, new TouchEvent("touchend", { bubbles: true }));
    await tick();

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(150);
  });
});
