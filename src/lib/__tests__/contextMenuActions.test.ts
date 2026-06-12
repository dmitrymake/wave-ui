// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Track } from "../types";
import type { TrackSource } from "../sources/trackSource";

// The MPD client is unused by these tests (the streaming path stays in-memory and
// the local path is asserted via the mocked LibraryActions spy), but mpd/library
// transitively imports it — stub it so nothing tries to open a socket.
vi.mock("../mpd/client", () => ({
  mpdClient: { send: vi.fn().mockResolvedValue(""), get isConnected() { return true; } },
}));

// Stub LibraryActions so the "local track" branch is observable without exercising
// the real MPD Favorites playlist round-trip.
const toggleFavoriteSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("../mpd/library", () => ({
  LibraryActions: {
    toggleFavorite: (...a: unknown[]) => toggleFavoriteSpy(...a),
  },
}));

vi.mock("../store", () => {
  const { writable } = require("svelte/store");
  return {
    closeContextMenu: vi.fn(),
    navigateTo: vi.fn(),
    activePlaylistTracks: writable([]),
    showModal: vi.fn(),
  };
});

import { toggleLike as contextToggleLike } from "../contextMenuActions";
import { registerTrackSource } from "../sources/trackSource";

// A stub streaming source claiming any "stub:" uri. Its toggleLike is a spy so we
// can prove contextMenuActions.toggleLike routes a streaming row to the source
// rather than the MPD Favorites playlist.
const sourceToggleLikeSpy = vi.fn().mockResolvedValue(undefined);
const stubSource: TrackSource = {
  id: "stub",
  matches: (uri: string) => uri.startsWith("stub:"),
  toggleLike: (track: Track) => sourceToggleLikeSpy(track),
};
registerTrackSource(stubSource);

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
});

describe("contextMenuActions.toggleLike routing (source-aware)", () => {
  it("routes a streaming track to its source's toggleLike, not MPD Favorites", () => {
    const streamTrack = baseTrack({ file: "stub:42", id: "42" });

    contextToggleLike(streamTrack);

    expect(sourceToggleLikeSpy).toHaveBeenCalledTimes(1);
    expect(sourceToggleLikeSpy).toHaveBeenCalledWith(streamTrack);
    // The fix's whole point: a streaming row must never poke the MPD Favorites path.
    expect(toggleFavoriteSpy).not.toHaveBeenCalled();
  });

  it("matches a streaming track by its neutral service tag too", () => {
    // No "stub:" prefix on the file; resolveSourceForTrack must still find the
    // source via the service tag stamped at queue/parse time.
    const taggedTrack = baseTrack({ file: "ram://cache/99", id: "99", service: "stub" });

    contextToggleLike(taggedTrack);

    expect(sourceToggleLikeSpy).toHaveBeenCalledWith(taggedTrack);
    expect(toggleFavoriteSpy).not.toHaveBeenCalled();
  });

  it("routes a local track to the MPD Favorites path (LibraryActions.toggleFavorite)", () => {
    const localTrack = baseTrack({ file: "Music/song.flac" });

    contextToggleLike(localTrack);

    expect(toggleFavoriteSpy).toHaveBeenCalledTimes(1);
    expect(toggleFavoriteSpy).toHaveBeenCalledWith(localTrack);
    expect(sourceToggleLikeSpy).not.toHaveBeenCalled();
  });

  it("is a no-op for a null track", () => {
    contextToggleLike(null);
    expect(sourceToggleLikeSpy).not.toHaveBeenCalled();
    expect(toggleFavoriteSpy).not.toHaveBeenCalled();
  });
});
