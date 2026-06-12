// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { DATABASE } from "./constants";
import { logger } from "./logger";
import type { DbTrack } from "./types";

interface ArtistEntry {
  name: string;
  file: string;
  thumbHash: string | null;
}

interface AlbumEntry {
  name: string;
  artist: string;
  file: string;
  thumbHash: string | null;
  qualityBadge: string | null;
  year: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export const db = {
  open(): Promise<IDBDatabase> {
    // Memoize a single shared connection instead of opening (and leaking) a fresh
    // one per query. A single connection also makes onversionchange effective.
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request: IDBOpenDBRequest = indexedDB.open(DATABASE.NAME, DATABASE.VERSION);

      request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        const database = (e.target as IDBOpenDBRequest).result;
        const transaction = (e.target as IDBOpenDBRequest).transaction!;
        let store: IDBObjectStore;

        if (database.objectStoreNames.contains(DATABASE.STORE_NAME)) {
          store = transaction.objectStore(DATABASE.STORE_NAME);
        } else {
          store = database.createObjectStore(DATABASE.STORE_NAME, {
            keyPath: "file",
          });
        }

        if (!store.indexNames.contains("artist")) {
          store.createIndex("artist", "artist", { unique: false });
        }
        if (!store.indexNames.contains("album")) {
          store.createIndex("album", "album", { unique: false });
        }
        if (!store.indexNames.contains("genre")) {
          store.createIndex("genre", "genre", { unique: false });
        }
        if (!store.indexNames.contains("album_artist")) {
          store.createIndex("album_artist", "album_artist", { unique: false });
        }
      };

      // Another tab holds an older-version connection open and is blocking our
      // upgrade. Surface it instead of hanging silently; it resolves once that
      // connection closes (every connection closes itself on versionchange below).
      request.onblocked = () => {
        logger.warn("[DB] open blocked — another tab holds an older DB version open");
      };

      request.onsuccess = () => {
        const database: IDBDatabase = request.result;
        // If another tab requests a version upgrade, close so we don't block it and
        // drop the memo so the next call reopens a fresh connection.
        database.onversionchange = () => {
          database.close();
          dbPromise = null;
        };
        // Reconnect on abnormal close.
        database.onclose = () => {
          dbPromise = null;
        };
        resolve(database);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
    return dbPromise;
  },

  async clear(): Promise<void> {
    const database: IDBDatabase = await this.open();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readwrite");
      tx.objectStore(DATABASE.STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async bulkAdd(tracks: DbTrack[]): Promise<void> {
    const database: IDBDatabase = await this.open();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readwrite");
      const store: IDBObjectStore = tx.objectStore(DATABASE.STORE_NAME);
      tracks.forEach((track) => store.put(track));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Atomically replace the whole store: clear + put run inside ONE transaction, so a
  // failure mid-write rolls the clear back and the previous library cache survives.
  // Doing clear() and bulkAdd() as two separate transactions could wipe the cache if
  // the second one fails (quota, crash, worker.terminate by the sync watchdog).
  async replaceAll(tracks: DbTrack[]): Promise<void> {
    const database: IDBDatabase = await this.open();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readwrite");
      const store: IDBObjectStore = tx.objectStore(DATABASE.STORE_NAME);
      store.clear();
      for (const track of tracks) store.put(track);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("replaceAll transaction aborted"));
    });
  },

  async getFilesMap(files: string[]): Promise<Map<string, DbTrack>> {
    if (!files || files.length === 0) return new Map();
    const database: IDBDatabase = await this.open();
    return new Promise((resolve) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readonly");
      const store: IDBObjectStore = tx.objectStore(DATABASE.STORE_NAME);
      const resultMap = new Map<string, DbTrack>();
      files.forEach((rawFile) => {
        const searchKey: string = rawFile.normalize("NFC").trim();
        const req: IDBRequest<DbTrack | undefined> = store.get(searchKey);
        req.onsuccess = (e: Event) => {
          const found = (e.target as IDBRequest<DbTrack | undefined>).result;
          if (found) resultMap.set(rawFile, found);
        };
      });
      // Gate completion on the transaction, not a per-request counter: tx.oncomplete
      // fires once all gets finish, and onerror/onabort guarantee we never hang
      // forever (e.g. if the DB closes mid-read). Errors degrade to a partial map —
      // callers in the enrichment path already treat misses as "not cached".
      tx.oncomplete = () => resolve(resultMap);
      tx.onerror = () => {
        logger.warn("[DB] getFilesMap transaction error", tx.error);
        resolve(resultMap);
      };
      tx.onabort = () => {
        logger.warn("[DB] getFilesMap transaction aborted", tx.error);
        resolve(resultMap);
      };
    });
  },

  async getArtists(): Promise<ArtistEntry[]> {
    const database: IDBDatabase = await this.open();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readonly");
      const store: IDBObjectStore = tx.objectStore(DATABASE.STORE_NAME);
      const uniqueMap = new Map<string, ArtistEntry>();
      const request: IDBRequest<IDBCursorWithValue | null> = store.openCursor();
      request.onsuccess = (event: Event) => {
        const cursor: IDBCursorWithValue | null = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          const t = cursor.value as DbTrack;
          const effectiveName: string = t.album_artist || t.artist;
          if (effectiveName && !uniqueMap.has(effectiveName)) {
            uniqueMap.set(effectiveName, {
              name: effectiveName,
              file: t.file,
              thumbHash: t.thumbHash ?? null,
            });
          }
          cursor.continue();
        } else {
          const sorted = Array.from(uniqueMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          );
          resolve(sorted);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getAlbums(): Promise<AlbumEntry[]> {
    const database: IDBDatabase = await this.open();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readonly");
      const index: IDBIndex = tx.objectStore(DATABASE.STORE_NAME).index("album");
      const albums: AlbumEntry[] = [];
      const request: IDBRequest<IDBCursorWithValue | null> = index.openCursor(null, "nextunique");
      request.onsuccess = (event: Event) => {
        const cursor: IDBCursorWithValue | null = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          const t = cursor.value as DbTrack;
          albums.push({
            name: t.album,
            artist: t.album_artist || t.artist,
            file: t.file,
            thumbHash: t.thumbHash ?? null,
            qualityBadge: t.qualityBadge ?? null,
            year: t.year || 0,
          });
          cursor.continue();
        } else {
          resolve(albums);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getArtistAlbums(artistName: string): Promise<AlbumEntry[]> {
    if (!artistName) return [];
    const database: IDBDatabase = await this.open();
    const safeArtist: string = artistName.normalize("NFC").trim();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readonly");
      const store: IDBObjectStore = tx.objectStore(DATABASE.STORE_NAME);
      const p1 = new Promise<DbTrack[]>((res, rej) => {
        if (store.indexNames.contains("album_artist")) {
          const req = store.index("album_artist").getAll(IDBKeyRange.only(safeArtist));
          req.onsuccess = (e: Event) => res((e.target as IDBRequest<DbTrack[]>).result);
          req.onerror = () => rej(req.error);
        } else res([]);
      });
      const p2 = new Promise<DbTrack[]>((res, rej) => {
        const req = store.index("artist").getAll(IDBKeyRange.only(safeArtist));
        req.onsuccess = (e: Event) => res((e.target as IDBRequest<DbTrack[]>).result);
        req.onerror = () => rej(req.error);
      });
      Promise.all([p1, p2])
        .then(([r1, r2]) => {
          const allTracks: DbTrack[] = [...r1, ...r2];
          const uniqueAlbums: AlbumEntry[] = [];
          const seenAlbums = new Set<string>();
          allTracks.forEach((t) => {
            if (!seenAlbums.has(t.album)) {
              seenAlbums.add(t.album);
              uniqueAlbums.push({
                name: t.album,
                artist: t.album_artist || t.artist,
                file: t.file,
                thumbHash: t.thumbHash ?? null,
                qualityBadge: t.qualityBadge ?? null,
                year: t.year || 0,
              });
            }
          });
          resolve(uniqueAlbums);
        })
        .catch((err) => reject(err));
    });
  },

  async getAlbumTracks(albumName: string, artistFilter: string | null = null): Promise<DbTrack[]> {
    const database: IDBDatabase = await this.open();
    const safeAlbum: string = albumName.normalize("NFC").trim();
    const safeArtist: string | null = artistFilter
      ? artistFilter.normalize("NFC").trim()
      : null;

    logger.log(
      `[DB] getAlbumTracks called. Album: "${safeAlbum}", FilterArtist: "${safeArtist}"`,
    );

    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readonly");
      const index: IDBIndex = tx.objectStore(DATABASE.STORE_NAME).index("album");

      const range: IDBKeyRange = IDBKeyRange.only(safeAlbum);
      const request: IDBRequest<DbTrack[]> = index.getAll(range);

      request.onsuccess = () => {
        let tracks: DbTrack[] = request.result;
        logger.log(
          `[DB] Found ${tracks.length} raw tracks for album "${safeAlbum}"`,
        );

        if (safeArtist) {
          const beforeCount: number = tracks.length;
          tracks = tracks.filter((t) => {
            const tArtist: string = (t.artist || "").normalize("NFC").trim();
            const tAlbumArtist: string = (t.album_artist || "").normalize("NFC").trim();

            const match: boolean = tArtist === safeArtist || tAlbumArtist === safeArtist;
            return match;
          });
          logger.log(
            `[DB] After artist filter: ${tracks.length} tracks (Removed ${beforeCount - tracks.length})`,
          );
        } else {
          logger.log("[DB] No artist filter provided. Returning all tracks.");
        }

        tracks.sort((a, b) => {
          const discA: number = parseInt(a.disc || "1");
          const discB: number = parseInt(b.disc || "1");
          if (discA !== discB) return discA - discB;
          const trA: number = parseInt(a.track || "0");
          const trB: number = parseInt(b.track || "0");
          return trA - trB;
        });
        resolve(tracks);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getGenres(): Promise<string[]> {
    const database: IDBDatabase = await this.open();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readonly");
      const index: IDBIndex = tx.objectStore(DATABASE.STORE_NAME).index("genre");
      const genres: string[] = [];
      const request: IDBRequest<IDBCursor | null> = index.openKeyCursor(null, "nextunique");
      request.onsuccess = (e: Event) => {
        const cursor: IDBCursor | null = (e.target as IDBRequest<IDBCursor | null>).result;
        if (cursor) {
          genres.push(cursor.key as string);
          cursor.continue();
        } else {
          resolve(genres);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getGenreTracks(genre: string): Promise<DbTrack[]> {
    const database: IDBDatabase = await this.open();
    const safeGenre: string = genre.normalize("NFC").trim();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readonly");
      const index: IDBIndex = tx.objectStore(DATABASE.STORE_NAME).index("genre");
      const request: IDBRequest<DbTrack[]> = index.getAll(IDBKeyRange.only(safeGenre));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async search(query: string): Promise<DbTrack[]> {
    if (!query) return [];
    const q: string = query.toLowerCase().normalize("NFC").trim();
    const database: IDBDatabase = await this.open();
    return new Promise((resolve, reject) => {
      const tx: IDBTransaction = database.transaction(DATABASE.STORE_NAME, "readonly");
      const store: IDBObjectStore = tx.objectStore(DATABASE.STORE_NAME);
      const results: DbTrack[] = [];
      const MAX_RESULTS: number = 100;
      const request: IDBRequest<IDBCursorWithValue | null> = store.openCursor();
      request.onsuccess = (e: Event) => {
        const cursor: IDBCursorWithValue | null = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          const t = cursor.value as DbTrack;
          const match: boolean =
            (!!t.title && t.title.toLowerCase().includes(q)) ||
            (!!t.artist && t.artist.toLowerCase().includes(q)) ||
            (!!t.album && t.album.toLowerCase().includes(q)) ||
            (!!t.album_artist && t.album_artist.toLowerCase().includes(q));
          if (match) {
            results.push(t);
          }
          if (results.length >= MAX_RESULTS) {
            resolve(results);
            return;
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },
};
