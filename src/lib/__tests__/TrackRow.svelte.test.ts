// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";
import { writable } from "svelte/store";
import type { Track } from "../types";
import { registerTrackSource, type TrackSource } from "../sources/trackSource";

// --- Store barrel mock -------------------------------------------------------
// TrackRow and its children (TrackThumb, LikeButton) all import from the store
// barrel. Replace it with minimal writable stores + stubbed functions so the row
// mounts without the real MPD/IndexedDB stack. Mocking the resolved barrel id
// (src/lib/store.ts) intercepts every `../lib/store(.js)` importer in the tree.
// `currentSong` is created via vi.hoisted so both the hoisted mock factory and the
// test body share the same store instance.
const currentSong = vi.hoisted(() => {
  const { writable: w } = require("svelte/store") as typeof import("svelte/store");
  return w<Partial<Track>>({ file: "" });
});
vi.mock("../store", () => ({
  currentSong,
  stations: writable([]),
  navigationStack: writable([{ view: "queue" }]),
  activeMenuTab: writable("queue"),
  favorites: writable<Set<string>>(new Set()),
  getTrackThumbUrl: () => "/images/default_icon.png",
  getTrackCoverUrl: () => "/images/default_cover.png",
  openContextMenu: vi.fn(),
  navigateTo: vi.fn(),
}));

// LikeButton (a TrackRow child) now reads yandexFavorites from its own domain
// module, no longer from the shared store barrel. Stub it here so the row mounts
// with a controlled, empty favorites set.
vi.mock("../stores/yandex", () => ({
  yandexFavorites: writable<Set<string>>(new Set()),
}));

// playerActions reaches into the MPD gateway at import time; the row only needs
// togglePlay to exist as a no-op for the click handler.
vi.mock("../playerActions", () => ({
  togglePlay: vi.fn(),
}));

// A test streaming source standing in for Yandex: owns `yandex:<id>` files and
// matches the now-playing song by extracted id (mirroring the real capability the
// row delegates to). Registered once so resolveSourceForTrack(track) finds it via
// the track's `service` tag.
const testSource: TrackSource = {
  id: "teststream",
  matches: (f: string) => f.startsWith("teststream:"),
  matchesPlaying: (track: Track, currentFile: string | null | undefined) => {
    const idOf = (s: string | null | undefined) => s?.match(/(\d+)/)?.[1] ?? null;
    const playing = idOf(currentFile);
    return playing !== null && idOf(track.file) === playing;
  },
};
registerTrackSource(testSource);

import TrackRow from "../../components/TrackRow.svelte";

const baseTrack = (over: Partial<Track>): Track =>
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

beforeEach(() => {
  currentSong.set({ file: "" });
});

describe("TrackRow — content", () => {
  it("renders the track title and artist", () => {
    const { getByText } = render(TrackRow, {
      props: { track: baseTrack({ file: "Music/a.flac", title: "Hello", artist: "World" }), index: 0 },
    });
    expect(getByText("Hello")).toBeInTheDocument();
    expect(getByText("World")).toBeInTheDocument();
  });

  it("shows 'Unknown Artist' when a titled local track has no artist", () => {
    const { getByText } = render(TrackRow, {
      props: { track: baseTrack({ file: "Music/a.flac", title: "Solo" }), index: 0 },
    });
    expect(getByText("Unknown Artist")).toBeInTheDocument();
  });
});

describe("TrackRow — now-playing highlight via source capability", () => {
  it("highlights a stream track when the playing file matches by source id (not by file)", () => {
    // The list uri (`teststream:55`) and the playing file (a CDN-style path) differ
    // textually but share id 55 — only the source's matchesPlaying can bridge them.
    currentSong.set({ file: "http://cdn.example/get/55.mp3" });
    const { container } = render(TrackRow, {
      props: {
        track: baseTrack({ file: "teststream:55", title: "Streamed", artist: "Art", service: "teststream" }),
        index: 3, // not the exact queue index, so the match must come from matchesPlaying
        playingIndex: 0,
        playingFile: "something/else.flac",
      },
    });
    // showStripes => the .striped class on the row.
    expect(container.querySelector(".row.striped")).not.toBeNull();
  });

  it("does NOT highlight a stream track whose id differs from the playing file", () => {
    currentSong.set({ file: "http://cdn.example/get/55.mp3" });
    const { container } = render(TrackRow, {
      props: {
        track: baseTrack({ file: "teststream:999", title: "Other", artist: "Art", service: "teststream" }),
        index: 3,
        playingIndex: 0,
        playingFile: "something/else.flac",
      },
    });
    expect(container.querySelector(".row.striped")).toBeNull();
  });

  it("highlights a local track by plain file comparison (no source override)", () => {
    const { container } = render(TrackRow, {
      props: {
        track: baseTrack({ file: "Music/now.flac", title: "Local", artist: "Art" }),
        index: 5,
        playingIndex: 0,
        playingFile: "Music/now.flac",
      },
    });
    expect(container.querySelector(".row.striped")).not.toBeNull();
  });

  it("does NOT highlight a local track whose file differs from the playing file", () => {
    const { container } = render(TrackRow, {
      props: {
        track: baseTrack({ file: "Music/other.flac", title: "Local", artist: "Art" }),
        index: 5,
        playingIndex: 0,
        playingFile: "Music/now.flac",
      },
    });
    expect(container.querySelector(".row.striped")).toBeNull();
  });

  it("marks the exact queue index as active (not striped) when it is the playing position", () => {
    currentSong.set({ file: "Music/now.flac" });
    const { container } = render(TrackRow, {
      props: {
        track: baseTrack({ file: "Music/now.flac", title: "Local", artist: "Art" }),
        index: 0,
        playingIndex: 0,
        playingFile: "Music/now.flac",
      },
    });
    const row = container.querySelector(".row");
    expect(row).toHaveClass("active");
    // active row suppresses the moving stripes.
    expect(row).not.toHaveClass("striped");
  });
});
