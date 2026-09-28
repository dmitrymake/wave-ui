// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db.js";
import { loadLibraryView } from "../libraryData.js";
import type { DbTrack } from "../types.js";

const track = (over: Partial<DbTrack> & { file: string }): DbTrack =>
  ({
    title: "t",
    artist: "Artist",
    album: "Album",
    genre: "Rock",
    time: 200,
    track: "1",
    ...over,
  }) as DbTrack;

beforeEach(async () => {
  await db.clear();
  await db.bulkAdd([
    track({ file: "Music/Artist/Album/01.flac", title: "Song One", year: 2020 }),
    track({ file: "Music/Artist/Album/02.flac", title: "Song Two", year: 2020 }),
  ]);
});

describe("loadLibraryView", () => {
  it("lists artists with display names", async () => {
    const { items } = await loadLibraryView("artists", { view: "root" });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].displayName).toBe("Artist");
    expect(items[0]._uid).toContain("artists");
  });

  it("lists tracks for an album with playable fields", async () => {
    const { items } = await loadLibraryView("albums", {
      view: "tracks_by_album",
      data: { name: "Album", artist: "Artist" },
    });
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Song One");
    expect(items[0].file).toBe("Music/Artist/Album/01.flac");
  });
});
