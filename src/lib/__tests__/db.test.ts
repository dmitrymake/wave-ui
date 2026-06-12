// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import { db, libraryRevision } from "../db.js";
import { DATABASE } from "../constants";
import type { DbTrack } from "../types";

// Helper to cast partial test data to DbTrack[]
const asDbTracks = (tracks: Record<string, unknown>[]) => tracks as unknown as DbTrack[];

// albumKey mirrors what mapRawTrack stores (album_artist || artist) and backs the
// composite [album, albumKey] index that getAlbums / getAlbumTracks rely on.
const sampleTracks = [
  {
    file: "Music/Artist1/Album1/01-track.flac",
    title: "First Track",
    artist: "Artist One",
    album: "Album One",
    album_artist: "Artist One",
    albumKey: "Artist One",
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
    albumKey: "Artist One",
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
    albumKey: "Artist Two",
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
    albumKey: "Artist Three",
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

describe("db.replaceAll", () => {
  it("atomically replaces the entire store in one transaction", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    expect((await db.getArtists()).length).toBe(3);

    await db.replaceAll(
      asDbTracks([
        {
          file: "Music/New/Album/01.flac",
          title: "Only Track",
          artist: "New Artist",
          album: "New Album",
          album_artist: "New Artist",
          albumKey: "New Artist",
          genre: "Ambient",
          track: "1",
          disc: "1",
          year: 2024,
        },
      ]),
    );

    const artists = await db.getArtists();
    expect(artists.length).toBe(1);
    expect(artists[0].name).toBe("New Artist");
  });

  it("clears the store when given an empty array", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));
    await db.replaceAll([]);
    expect(await db.getArtists()).toHaveLength(0);
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

// Two albums that share a title ("Greatest Hits") but belong to different artists.
// Before the composite [album, albumKey] index, both collapsed into one card and one
// track list; they must now stay distinct.
const sameNameAlbums = [
  {
    file: "Music/ArtistA/Greatest Hits/01.flac",
    title: "A Hit",
    artist: "Artist A",
    album: "Greatest Hits",
    album_artist: "Artist A",
    albumKey: "Artist A",
    genre: "Pop",
    track: "1",
    disc: "1",
    year: 2010,
  },
  {
    file: "Music/ArtistA/Greatest Hits/02.flac",
    title: "Another A Hit",
    artist: "Artist A",
    album: "Greatest Hits",
    album_artist: "Artist A",
    albumKey: "Artist A",
    genre: "Pop",
    track: "2",
    disc: "1",
    year: 2010,
  },
  {
    file: "Music/ArtistB/Greatest Hits/01.flac",
    title: "A B Hit",
    artist: "Artist B",
    album: "Greatest Hits",
    album_artist: "Artist B",
    albumKey: "Artist B",
    genre: "Rock",
    track: "1",
    disc: "1",
    year: 2012,
  },
];

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

  it("keeps same-named albums of different artists as distinct cards", async () => {
    await db.bulkAdd(asDbTracks(sameNameAlbums));
    const albums = await db.getAlbums();
    // Both "Greatest Hits" entries must survive, one per artist.
    expect(albums.length).toBe(2);
    const artists = albums.map((a) => a.artist).sort();
    expect(artists).toEqual(["Artist A", "Artist B"]);
    albums.forEach((a) => expect(a.name).toBe("Greatest Hits"));
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

  it("separates same-named albums of different artists by the artist filter", async () => {
    await db.bulkAdd(asDbTracks(sameNameAlbums));

    const aTracks = await db.getAlbumTracks("Greatest Hits", "Artist A");
    expect(aTracks).toHaveLength(2);
    aTracks.forEach((t) => expect(t.artist).toBe("Artist A"));

    const bTracks = await db.getAlbumTracks("Greatest Hits", "Artist B");
    expect(bTracks).toHaveLength(1);
    expect(bTracks[0].artist).toBe("Artist B");
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

// The destructive v4 migration clears the store, then a background resync repopulates
// it. libraryRevision is the reactive signal mounted views key on so a completed
// resync repaints them instead of leaving the library blank. These tests pin both the
// signal and the onupgradeneeded clear path.
describe("libraryRevision resync signal", () => {
  it("fires when the store is repopulated (resync landed)", async () => {
    const before = get(libraryRevision);
    await db.bulkAdd(asDbTracks(sampleTracks));
    // Each successful write bumps the revision so a mounted view refetches.
    expect(get(libraryRevision)).toBeGreaterThan(before);
  });

  it("fires when the store is cleared (start of force-resync) and replaced", async () => {
    await db.bulkAdd(asDbTracks(sampleTracks));

    const afterAdd = get(libraryRevision);
    await db.clear();
    expect(get(libraryRevision)).toBeGreaterThan(afterAdd);

    const afterClear = get(libraryRevision);
    await db.replaceAll(asDbTracks(sampleTracks));
    expect(get(libraryRevision)).toBeGreaterThan(afterClear);
  });
});

// Exercise the REAL db.ts onupgradeneeded against the production database name. The
// previous version of these tests hand-copied the handler into the test file, so
// production-vs-mirror drift would have stayed green; instead we pre-create the actual
// "MoodePlayerDB" at an OLDER schema version (stale, pre-albumKey records) and then open
// it through a freshly imported db module — whose own onupgradeneeded fires at the
// current version. A pre-existing store carrying stale records must be force-cleared so
// the App resync path repopulates it; a brand-new store must be left untouched.
describe("v4 migration onupgradeneeded clear path (real db.ts handler)", () => {
  // Tear down the production DB and any memoized connection from the static `db` import
  // (whose onversionchange closes it on delete) so each case can pre-seed an older
  // version and then drive the real upgrade through a fresh module instance.
  async function resetProductionDb(): Promise<void> {
    vi.resetModules();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DATABASE.NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }

  // Open DATABASE.NAME at an older version with the store pre-populated, WITHOUT the
  // current schema's clear-on-upgrade. This stands in for a cache written by a prior
  // app version so the real handler has something to migrate (and clear).
  function seedOlderVersion(version: number, record: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DATABASE.NAME, version);
      req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        const database = (e.target as IDBOpenDBRequest).result;
        database.createObjectStore(DATABASE.STORE_NAME, { keyPath: "file" });
      };
      req.onsuccess = () => {
        const database = req.result;
        const tx = database.transaction(DATABASE.STORE_NAME, "readwrite");
        tx.objectStore(DATABASE.STORE_NAME).put(record);
        tx.oncomplete = () => {
          database.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function countRecords(database: IDBDatabase): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const reqC = tx.objectStore(DATABASE.STORE_NAME).count();
      reqC.onsuccess = () => resolve(reqC.result);
      reqC.onerror = () => reject(reqC.error);
    });
  }

  // After resetModules the statically-imported `db` is stale; load a fresh instance so
  // its internal dbPromise is null and db.open() actually runs the real upgrade.
  async function freshDbModule() {
    return (await import("../db.js")) as typeof import("../db.js");
  }

  beforeEach(async () => {
    await resetProductionDb();
  });

  it("runs the real handler to clear a pre-existing store with stale records on upgrade", async () => {
    // A pre-albumKey record cached by an older app version (DATABASE.VERSION is 4, so 1
    // is genuinely older and forces an upgrade transaction).
    await seedOlderVersion(DATABASE.VERSION - 1, {
      file: "Music/Old/Album/01.flac",
      title: "Stale Track",
      artist: "Stale Artist",
      album: "Stale Album",
      // no albumKey — exactly the kind of record the migration must drop
    });

    // Open through the REAL db module: db.open() upgrades to DATABASE.VERSION and its
    // own onupgradeneeded must force-clear the pre-existing store (resync trigger).
    const fresh = await freshDbModule();
    const database = await fresh.db.open();
    expect(database.version).toBe(DATABASE.VERSION);
    expect(database.objectStoreNames.contains(DATABASE.STORE_NAME)).toBe(true);
    expect(await countRecords(database)).toBe(0);

    // After the destructive clear the store is empty, so the App startup path treats it
    // as "needs resync"; getArtists() resolving empty is what gates that resync.
    expect(await fresh.db.getArtists()).toHaveLength(0);
  });

  it("runs the real handler but leaves a brand-new store untouched (no spurious clear)", async () => {
    // No older version seeded: the first open creates the store fresh, so the real
    // handler's preExisting branch is false and it must NOT clear anything.
    const fresh = await freshDbModule();
    const database = await fresh.db.open();
    expect(database.version).toBe(DATABASE.VERSION);

    // The newly created store accepts and retains a write (proves it was not cleared
    // during creation), and the real composite album_albumKey index is queryable.
    await fresh.db.bulkAdd(asDbTracks([sampleTracks[0]]));
    expect(await countRecords(database)).toBe(1);
    expect((await fresh.db.getAlbums()).length).toBe(1);
  });

  it("bumps libraryRevision once the repopulating resync write lands after the clear", async () => {
    await seedOlderVersion(DATABASE.VERSION - 1, {
      file: "Music/Old/Album/01.flac",
      title: "Stale Track",
      artist: "Stale Artist",
      album: "Stale Album",
    });

    // The fresh module owns its own libraryRevision store; the upgrade clear path runs
    // inside onupgradeneeded (no bump there), then the App resync writes via bulkAdd,
    // which bumps the signal so a mounted view repaints instead of staying blank.
    const fresh = await freshDbModule();
    await fresh.db.open();
    expect(get(fresh.libraryRevision)).toBe(0);

    await fresh.db.replaceAll(asDbTracks(sampleTracks));
    expect(get(fresh.libraryRevision)).toBeGreaterThan(0);
    expect((await fresh.db.getArtists()).length).toBe(3);
  });
});
