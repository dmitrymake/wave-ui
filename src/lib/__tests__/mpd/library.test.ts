import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockSend = vi.fn().mockResolvedValue("");

vi.mock("../../mpd/client", () => ({
  mpdClient: {
    send: (...args: string[]) => mockSend(...args),
  },
}));

vi.mock("../../mpd/parser", () => ({
  MpdParser: {
    parsePlaylists: vi.fn().mockReturnValue([]),
    parseTracks: vi.fn().mockReturnValue([]),
  },
}));

vi.mock("../../../config", () => ({
  CONFIG: { MOODE_IP: "192.168.1.100" },
}));

vi.mock("../../store", () => {
  const { writable } = require("svelte/store");
  return {
    isSyncingLibrary: writable(false),
    isLoadingPlaylists: writable(false),
    playlists: writable([]),
    isLoadingTracks: writable(false),
    activePlaylistTracks: writable([]),
    showToast: vi.fn(),
    favorites: writable(new Set()),
  };
});

vi.mock("../../db", () => ({
  db: { getFilesMap: vi.fn().mockResolvedValue(new Map()) },
}));

vi.mock("../../utils", () => ({
  generateUid: vi.fn().mockReturnValue("test-uid"),
}));

vi.mock("../../workers/sync.worker.js?worker", () => ({
  default: vi.fn().mockImplementation(() => ({
    postMessage: vi.fn(),
    terminate: vi.fn(),
  })),
}));

import { LibraryActions } from "../../mpd/library.js";
import { MpdParser } from "../../mpd/parser";
import { playlists, favorites, showToast } from "../../store";
import { get } from "svelte/store";

beforeEach(() => {
  vi.clearAllMocks();
  playlists.set([]);
  favorites.set(new Set());
});

describe("LibraryActions.loadPlaylists", () => {
  it("loads and enhances playlists with colors", async () => {
    (MpdParser.parsePlaylists as ReturnType<typeof vi.fn>).mockReturnValue([
      { name: "Rock Mix", lastModified: "2024-01-01" },
      { name: "Favorites", lastModified: "2024-01-02" },
    ]);

    await LibraryActions.loadPlaylists();

    const result = get(playlists);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("color");
    expect(result[0]).toHaveProperty("colorVar");

    // Favorites should have special gradient
    const favPlaylist = result.find((p: { name: string }) => p.name === "Favorites");
    expect(favPlaylist.color).toContain("hsl(348");
    expect(favPlaylist.colorVar).toBe("var(--c-heart)");
  });

  it("sends listplaylists command", async () => {
    (MpdParser.parsePlaylists as ReturnType<typeof vi.fn>).mockReturnValue([]);
    await LibraryActions.loadPlaylists();
    expect(mockSend).toHaveBeenCalledWith("listplaylists");
  });
});

describe("LibraryActions.deletePlaylist", () => {
  it("sends rm command", async () => {
    (MpdParser.parsePlaylists as ReturnType<typeof vi.fn>).mockReturnValue([]);
    await LibraryActions.deletePlaylist("Old Playlist");
    expect(mockSend).toHaveBeenCalledWith('rm "Old Playlist"');
  });

  it("does nothing for empty name", async () => {
    await LibraryActions.deletePlaylist("");
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("LibraryActions.renamePlaylist", () => {
  it("sends rename command", async () => {
    (MpdParser.parsePlaylists as ReturnType<typeof vi.fn>).mockReturnValue([]);
    await LibraryActions.renamePlaylist("Old", "New");
    expect(mockSend).toHaveBeenCalledWith('rename "Old" "New"');
  });
});

describe("LibraryActions.loadFavorites", () => {
  it("loads favorites into set", async () => {
    (MpdParser.parseTracks as ReturnType<typeof vi.fn>).mockReturnValue([
      { file: "Music/fav1.mp3" },
      { file: "Music/fav2.mp3" },
    ]);

    await LibraryActions.loadFavorites();

    const favs = get(favorites);
    expect(favs.size).toBe(2);
    expect(favs.has("Music/fav1.mp3")).toBe(true);
    expect(favs.has("Music/fav2.mp3")).toBe(true);
  });

  it("handles error gracefully", async () => {
    mockSend.mockRejectedValueOnce(new Error("no such playlist"));
    await LibraryActions.loadFavorites();
    expect(get(favorites).size).toBe(0);
  });
});

describe("LibraryActions.movePlaylistTrack", () => {
  it("sends playlistmove command", async () => {
    await LibraryActions.movePlaylistTrack("My List", 2, 5);
    expect(mockSend).toHaveBeenCalledWith('playlistmove "My List" 2 5');
  });
});

describe("LibraryActions.removeFromPlaylist", () => {
  it("sends playlistdelete command", async () => {
    await LibraryActions.removeFromPlaylist("My List", 3);
    expect(mockSend).toHaveBeenCalledWith('playlistdelete "My List" 3');
    expect(showToast).toHaveBeenCalledWith("Track removed", "success");
  });
});

describe("gradient and color functions", () => {
  it("Favorites playlist gets special gradient", async () => {
    (MpdParser.parsePlaylists as ReturnType<typeof vi.fn>).mockReturnValue([{ name: "Favorites" }]);
    await LibraryActions.loadPlaylists();
    const fav = get(playlists)[0];
    expect(fav.color).toContain("348");
    expect(fav.colorVar).toBe("var(--c-heart)");
  });

  it("different playlists get different hue gradients", async () => {
    (MpdParser.parsePlaylists as ReturnType<typeof vi.fn>).mockReturnValue([
      { name: "Rock" },
      { name: "Jazz" },
    ]);
    await LibraryActions.loadPlaylists();
    const result = get(playlists);
    expect(result[0].color).not.toBe(result[1].color);
  });
});
