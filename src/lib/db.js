import { DATABASE } from "./constants";

export const db = {
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE.NAME, DATABASE.VERSION);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        const transaction = e.target.transaction;
        let store;

        if (!database.objectStoreNames.contains(DATABASE.STORE_NAME)) {
          store = database.createObjectStore(DATABASE.STORE_NAME, {
            keyPath: "file",
          });
        } else {
          store = transaction.objectStore(DATABASE.STORE_NAME);
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

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async clear() {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readwrite");
      tx.objectStore(DATABASE.STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async bulkAdd(tracks) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readwrite");
      const store = tx.objectStore(DATABASE.STORE_NAME);
      tracks.forEach((track) => store.put(track));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Эффективно получает метаданные для списка файлов.
   * Используется для "гидратации" плейлистов.
   */
  async getFilesMap(files) {
    if (!files || files.length === 0) return new Map();
    const database = await this.open();

    return new Promise((resolve) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const store = tx.objectStore(DATABASE.STORE_NAME);
      const resultMap = new Map();

      let loaded = 0;
      files.forEach((file) => {
        const req = store.get(file);
        req.onsuccess = (e) => {
          const res = e.target.result;
          if (res) resultMap.set(file, res);
          loaded++;
          if (loaded === files.length) resolve(resultMap);
        };
        req.onerror = () => {
          loaded++;
          if (loaded === files.length) resolve(resultMap);
        };
      });
    });
  },

  async getArtists() {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const store = tx.objectStore(DATABASE.STORE_NAME);
      const uniqueMap = new Map();
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const t = cursor.value;
          const effectiveName = t.album_artist || t.artist;
          if (effectiveName && !uniqueMap.has(effectiveName)) {
            uniqueMap.set(effectiveName, {
              name: effectiveName,
              file: t.file,
              thumbHash: t.thumbHash,
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

  async getAlbums() {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const index = tx.objectStore(DATABASE.STORE_NAME).index("album");
      const albums = [];
      const request = index.openCursor(null, "nextunique");

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const t = cursor.value;
          albums.push({
            name: t.album,
            artist: t.album_artist || t.artist,
            file: t.file,
            thumbHash: t.thumbHash,
            qualityBadge: t.qualityBadge,
          });
          cursor.continue();
        } else {
          resolve(albums);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getArtistAlbums(artistName) {
    if (!artistName) return [];
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const store = tx.objectStore(DATABASE.STORE_NAME);

      const p1 = new Promise((res) => {
        if (store.indexNames.contains("album_artist")) {
          store
            .index("album_artist")
            .getAll(IDBKeyRange.only(artistName)).onsuccess = (e) =>
            res(e.target.result);
        } else {
          res([]);
        }
      });

      const p2 = new Promise((res) => {
        store.index("artist").getAll(IDBKeyRange.only(artistName)).onsuccess = (
          e,
        ) => res(e.target.result);
      });

      Promise.all([p1, p2])
        .then(([r1, r2]) => {
          const allTracks = [...r1, ...r2];
          const uniqueAlbums = [];
          const seenAlbums = new Set();
          allTracks.forEach((t) => {
            if (!seenAlbums.has(t.album)) {
              seenAlbums.add(t.album);
              uniqueAlbums.push({
                name: t.album,
                artist: t.album_artist || t.artist,
                file: t.file,
                thumbHash: t.thumbHash,
                qualityBadge: t.qualityBadge,
              });
            }
          });
          resolve(uniqueAlbums);
        })
        .catch((err) => reject(err));
    });
  },

  async getAlbumTracks(albumName) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const index = tx.objectStore(DATABASE.STORE_NAME).index("album");
      const range = IDBKeyRange.only(albumName);
      const request = index.getAll(range);

      request.onsuccess = () => {
        const tracks = request.result;
        tracks.sort((a, b) => {
          const discA = parseInt(a.disc || 1);
          const discB = parseInt(b.disc || 1);
          if (discA !== discB) return discA - discB;
          const trA = parseInt(a.track || 0);
          const trB = parseInt(b.track || 0);
          return trA - trB;
        });
        resolve(tracks);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getGenres() {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const index = tx.objectStore(DATABASE.STORE_NAME).index("genre");
      const genres = [];
      const request = index.openKeyCursor(null, "nextunique");
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          genres.push(cursor.key);
          cursor.continue();
        } else {
          resolve(genres);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getGenreTracks(genre) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const index = tx.objectStore(DATABASE.STORE_NAME).index("genre");
      const request = index.getAll(IDBKeyRange.only(genre));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async search(query) {
    if (!query) return [];
    const q = query.toLowerCase();
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DATABASE.STORE_NAME, "readonly");
      const store = tx.objectStore(DATABASE.STORE_NAME);
      const results = [];
      const MAX_RESULTS = 100;
      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const t = cursor.value;
          const match =
            (t.title && t.title.toLowerCase().includes(q)) ||
            (t.artist && t.artist.toLowerCase().includes(q)) ||
            (t.album && t.album.toLowerCase().includes(q)) ||
            (t.album_artist && t.album_artist.toLowerCase().includes(q));
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
