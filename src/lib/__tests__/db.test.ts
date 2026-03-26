import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db.js";
import type { DbTrack } from "../types";

// Helper to cast partial test data to DbTrack[]
const asDbTracks = (tracks: Record<string, unknown>[]) => tracks as unknown as DbTrack[];

const sampleTracks = [
  {
    file: "Music/Artist1/Album1/01-track.flac",
    title: "First Track",
    artist: "Artist One",
    album: "Album One",
    album_artist: "Artist One",
    genre: "Rock",
    track: "1",
    disc: "1",
    thumbHash: "hash1",
    qualityBadge: "FLAC",
    year: 2020,
  },
  {
    file: "Music/Artist1/Album1/02-track.flac",
    title: "Second Track",
    artist: "Artist One",
    album: "Album One",
    album_artist: "Artist One",
    genre: "Rock",
    track: "2",
    disc: "1",
    thumbHash: "hash1",
    qualityBadge: "FLAC",
    year: 2020,
  },
  {
    file: "Music/Artist2/Album2/01-song.mp3",
    title: "Jazz Song",
    artist: "Artist Two",
    album: "Album Two",
    album_artist: "Artist Two",
    genre: "Jazz",
    track: "1",
    disc: "1",
    thumbHash: "hash2",
    qualityBadge: "MP3",
    year: 2019,
  },
  {
    file: "Music/Artist3/Album3/01-electronic.flac",
    title: "Electronic Beat",
    artist: "Artist Three",
    album: "Album Three",
    album_artist: "Artist Three",
    genre: "Electronic",
    track: "1",
    disc: "1",
    thumbHash: "hash3",
    qualityBadge: "FLAC",
    year: 2021,
  },
];

beforeEach(async () => {
  // Clear DB before each test
  try {
    await db.clear();
  } catch {
    // DB might not exist yet
  }
});

describe("db.open", () => {
  it("opens the database", async () => {
    const database = await db.open();
    expect(database).toBeDefined();
    expect(database.name).toBe("MoodePlayerDB");
  });
});

describe("db.bulkAdd + db.clear", () => {
  it("adds tracks and clears them", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const artists = await db.getArtists();
    expect(artists.length).toBeGreaterThan(0);

    await db.clear();
    const afterClear = await db.getArtists();
    expect(afterClear).toHaveLength(0);
  });
});

describe("db.getFilesMap", () => {
  it("returns empty map for empty input", async () => {
    const result = await db.getFilesMap([]);
    expect(result.size).toBe(0);
  });

  it("returns empty map for null input", async () => {
    const result = await db.getFilesMap(null as any);
    expect(result.size).toBe(0);
  });

  it("finds tracks by file path", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const files = [sampleTracks[0].file!, sampleTracks[2].file!];
    const result = await db.getFilesMap(files);
    expect(result.size).toBe(2);
    expect(result.get(sampleTracks[0].file!)!.title).toBe("First Track");
  });

  it("skips missing files", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const result = await db.getFilesMap(["nonexistent.mp3"]);
    expect(result.size).toBe(0);
  });
});

describe("db.getArtists", () => {
  it("returns unique artists sorted", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const artists = await db.getArtists();
    expect(artists.length).toBe(3);
    // Sorted alphabetically
    expect(artists[0].name).toBe("Artist One");
    expect(artists[1].name).toBe("Artist Three");
    expect(artists[2].name).toBe("Artist Two");
  });

  it("returns empty for empty DB", async () => {
    const artists = await db.getArtists();
    expect(artists).toHaveLength(0);
  });
});

describe("db.getAlbums", () => {
  it("returns albums", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const albums = await db.getAlbums();
    expect(albums.length).toBe(3);
    albums.forEach((a) => {
      expect(a).toHaveProperty("name");
      expect(a).toHaveProperty("artist");
      expect(a).toHaveProperty("file");
    });
  });
});

describe("db.getArtistAlbums", () => {
  it("returns albums for a specific artist", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const albums = await db.getArtistAlbums("Artist One");
    expect(albums.length).toBe(1);
    expect(albums[0].name).toBe("Album One");
  });

  it("returns empty for unknown artist", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const albums = await db.getArtistAlbums("Nobody");
    expect(albums).toHaveLength(0);
  });

  it("returns empty for null input", async () => {
    const albums = await db.getArtistAlbums(null as any);
    expect(albums).toHaveLength(0);
  });
});

describe("db.getAlbumTracks", () => {
  it("returns sorted tracks for an album", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const tracks = await db.getAlbumTracks("Album One");
    expect(tracks).toHaveLength(2);
    expect(parseInt(tracks[0].track)).toBeLessThanOrEqual(parseInt(tracks[1].track));
  });

  it("filters by artist", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const tracks = await db.getAlbumTracks("Album One", "Artist One");
    expect(tracks).toHaveLength(2);
  });

  it("returns empty for non-matching artist filter", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const tracks = await db.getAlbumTracks("Album One", "Wrong Artist");
    expect(tracks).toHaveLength(0);
  });
});

describe("db.getGenres", () => {
  it("returns unique genres", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const genres = await db.getGenres();
    expect(genres).toContain("Rock");
    expect(genres).toContain("Jazz");
    expect(genres).toContain("Electronic");
  });
});

describe("db.getGenreTracks", () => {
  it("returns tracks for a genre", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const tracks = await db.getGenreTracks("Rock");
    expect(tracks).toHaveLength(2);
  });

  it("returns empty for unknown genre", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const tracks = await db.getGenreTracks("Classical");
    expect(tracks).toHaveLength(0);
  });
});

describe("db.search", () => {
  it("returns empty for empty query", async () => {
    expect(await db.search("")).toHaveLength(0);
    expect(await db.search(null as any)).toHaveLength(0);
  });

  it("finds tracks by title", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const results = await db.search("Jazz");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("Jazz Song");
  });

  it("finds tracks by artist", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const results = await db.search("artist two");
    expect(results.length).toBeGreaterThan(0);
  });

  it("finds tracks by album", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const results = await db.search("album three");
    expect(results.length).toBeGreaterThan(0);
  });

  it("is case-insensitive", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    const r1 = await db.search("ROCK");
    const r2 = await db.search("rock");
    // Both search by genre won't match (search checks title/artist/album/album_artist)
    // But "electronic beat" will match
    const r3 = await db.search("ELECTRONIC");
    expect(r3.length).toBeGreaterThan(0);
  });

  it("limits results to 100", async () => {
    // Create 150 tracks
    const manyTracks = Array.from({ length: 150 }, (_, i) => ({
      file: `Music/track${i}.mp3`,
      title: `Test Track ${i}`,
      artist: "Test",
      album: "Test Album",
      genre: "Test",
    }));
    await db.bulkAdd(asDbTracks(manyTracks));
    const results = await db.search("test");
    expect(results.length).toBeLessThanOrEqual(100);
  });
});
