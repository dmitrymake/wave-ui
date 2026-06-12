// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("../mpd/client", () => ({
  mpdClient: { send: mockSend },
}));
vi.mock("../mpd/parser", () => ({
  // Tests feed JSON track arrays through mockSend; the parser just decodes them.
  MpdParser: { parseTracks: (raw: string) => JSON.parse(raw || "[]") },
}));

import { searchPlaylists } from "../playlistSearch";
import type { Playlist } from "../types";

const playlists = [
  { name: "Favorites" },
  { name: "Rock" },
  { name: "Jazz" },
] as Playlist[];

beforeEach(() => mockSend.mockReset());

describe("searchPlaylists", () => {
  it("groups track matches and skips Favorites", async () => {
    // Targets are scanned in order: Rock, then Jazz (Favorites is skipped).
    mockSend
      .mockResolvedValueOnce(
        JSON.stringify([
          { title: "Creep", artist: "Radiohead" },
          { title: "Other", artist: "X" },
        ]),
      )
      .mockResolvedValueOnce("[]");

    const ctrl = new AbortController();
    const partialSizes: number[] = [];
    const res = await searchPlaylists("creep", playlists, ctrl.signal, (g) =>
      partialSizes.push(g.length),
    );

    expect(res.matchedPlaylists).toEqual([]);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].playlist.name).toBe("Rock");
    expect(res.groups[0].tracks).toHaveLength(1);
    expect(res.groups[0].tracks[0]._uid).toBe("Rock-0");
    expect(partialSizes).toEqual([1]);
    // Only Rock + Jazz scanned (Favorites skipped).
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(String(mockSend.mock.calls[0][0])).toContain("Rock");
  });

  it("matches playlists by name", async () => {
    mockSend.mockResolvedValue("[]");
    const ctrl = new AbortController();
    const res = await searchPlaylists("rock", playlists, ctrl.signal);
    expect(res.matchedPlaylists.map((p) => p.name)).toEqual(["Rock"]);
  });

  it("does not scan when the signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    mockSend.mockResolvedValue("[]");
    const res = await searchPlaylists("x", playlists, ctrl.signal);
    expect(mockSend).not.toHaveBeenCalled();
    expect(res.groups).toEqual([]);
  });
});
