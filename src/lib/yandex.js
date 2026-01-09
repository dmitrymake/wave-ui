import { get } from "svelte/store";
import { yandexToken, yandexFavorites } from "./store";
import md5 from "md5";

export const YandexApi = {
  async request(path, options = {}) {
    const token = get(yandexToken);
    if (!token) throw new Error("No token provided");

    const proxyUrl = `/wave-api.php?action=yandex_proxy&path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;

    const headers = {
      Authorization: `OAuth ${token}`,
      "Accept-Language": "en",
      ...(options.headers || {}),
    };

    const res = await fetch(proxyUrl, {
      method: options.method || "GET",
      headers: headers,
      body: options.body,
    });

    if (!res.ok) {
      let errorMsg = `Yandex API Error: ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errorMsg = errJson.error;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    if (options.isXml) {
      return await res.text();
    }

    return await res.json();
  },

  async getUserId() {
    const data = await this.request("/account/status");
    if (!data.result || !data.result.account) {
      throw new Error("Invalid response from Yandex: " + JSON.stringify(data));
    }
    return data.result.account.uid;
  },

  async getUserPlaylists() {
    try {
      const uid = await this.getUserId();
      const data = await this.request(`/users/${uid}/playlists/list`);
      return data.result || [];
    } catch (e) {
      console.error("Yandex Playlists Error:", e);
      return [];
    }
  },

  async getPlaylistTracks(kind, uid = null, page = 0) {
    try {
      if (!uid) uid = await this.getUserId();
      const data = await this.request(`/users/${uid}/playlists/${kind}`);
      const res = data.result;
      if (!res || !res.tracks) return { tracks: [], total: 0 };
      const ids = res.tracks.map((t) => t.id);
      const PAGE_SIZE = 50;
      const start = page * PAGE_SIZE;
      const slice = ids.slice(start, start + PAGE_SIZE);
      const tracks = await this.getTracksByIds(slice);
      return {
        tracks,
        total: ids.length,
      };
    } catch (e) {
      console.error("Yandex Playlist Tracks Error:", e);
      return { tracks: [], total: 0 };
    }
  },

  async getFavorites(page = 0) {
    try {
      const uid = await this.getUserId();
      const data = await this.request(`/users/${uid}/likes/tracks`);
      let ids = [];
      const res = data.result;
      if (!res) return { tracks: [], total: 0 };

      if (res.ids && Array.isArray(res.ids)) {
        ids = res.ids;
      } else if (res.library && Array.isArray(res.library)) {
        ids = res.library.map((t) => t.id);
      } else if (
        res.library &&
        res.library.tracks &&
        Array.isArray(res.library.tracks)
      ) {
        ids = res.library.tracks.map((t) => t.id);
      } else if (Array.isArray(res)) {
        ids = res.map((t) => t.id);
      }
      ids = ids.filter((id) => id);

      if (page === 0) {
        yandexFavorites.set(new Set(ids.map(String)));
      }

      if (ids.length === 0) return { tracks: [], total: 0 };
      const PAGE_SIZE = 50;
      const start = page * PAGE_SIZE;
      const slice = ids.slice(start, start + PAGE_SIZE);
      const tracks = await this.getTracksByIds(slice);
      return {
        tracks,
        total: ids.length,
      };
    } catch (e) {
      console.error("Yandex Favorites Error:", e);
      return { tracks: [], total: 0 };
    }
  },

  async toggleLike(trackId, isLiked) {
    const uid = await this.getUserId();
    const action = isLiked ? "remove" : "add";

    yandexFavorites.update((s) => {
      const n = new Set(s);
      if (isLiked) n.delete(String(trackId));
      else n.add(String(trackId));
      return n;
    });

    try {
      await this.request(`/users/${uid}/likes/tracks/${action}`, {
        method: "POST",
        body: `track-id=${trackId}`,
      });
    } catch (e) {
      console.error("Failed to toggle like", e);
      yandexFavorites.update((s) => {
        const n = new Set(s);
        if (isLiked) n.add(String(trackId));
        else n.delete(String(trackId));
        return n;
      });
      throw e;
    }
  },

  async search(query, type = "all", page = 0) {
    if (!query) return { tracks: [], albums: [], artists: [] };
    try {
      const p = page;
      const data = await this.request(
        `/search?text=${encodeURIComponent(query)}&type=${type}&page=${p}&nocorrect=false`,
      );
      const res = data.result;
      let tracks = [];
      let albums = [];
      let artists = [];
      if (res.tracks && res.tracks.results) {
        tracks = this.normalizeTracks(res.tracks.results);
      }
      if (res.albums && res.albums.results) {
        albums = res.albums.results.map((a) => ({
          ...a,
          isAlbum: true,
          image: a.coverUri
            ? `https://${a.coverUri.replace("%%", "200x200")}`
            : null,
          artist:
            a.artists && a.artists.length > 0 ? a.artists[0].name : "Unknown",
        }));
      }
      if (res.artists && res.artists.results) {
        artists = res.artists.results.map((a) => ({
          ...a,
          isArtist: true,
          name: a.name,
          image:
            a.cover && a.cover.uri
              ? `https://${a.cover.uri.replace("%%", "200x200")}`
              : null,
        }));
      }
      return { tracks, albums, artists };
    } catch (e) {
      console.error("Yandex Search Error:", e);
      return { tracks: [], albums: [], artists: [] };
    }
  },

  async getAlbumTracks(albumId) {
    try {
      const data = await this.request(`/albums/${albumId}/with-tracks`);
      if (!data.result || !data.result.volumes) return [];

      const rawTracks = [];
      data.result.volumes.forEach((vol) => {
        if (Array.isArray(vol)) {
          rawTracks.push(...vol);
        }
      });
      return this.normalizeTracks(rawTracks);
    } catch (e) {
      console.error("Yandex Album Error:", e);
      return [];
    }
  },

  async getArtistTracks(artistId) {
    try {
      const data = await this.request(
        `/artists/${artistId}/tracks?page=0&page-size=50`,
      );
      if (!data.result || !data.result.tracks) return [];
      return this.normalizeTracks(data.result.tracks);
    } catch (e) {
      console.error("Yandex Artist Error:", e);
      return [];
    }
  },

  async getSimilarTracks(trackId) {
    try {
      const data = await this.request(`/tracks/${trackId}/similar`);
      if (!data.result || !data.result.similarTracks) return [];
      return this.normalizeTracks(data.result.similarTracks);
    } catch (e) {
      console.error("Yandex Similar Tracks Error:", e);
      return [];
    }
  },

  async getTracksByIds(ids) {
    if (!ids.length) return [];
    const data = await this.request("/tracks", {
      method: "POST",
      body: `track-ids=${ids.join(",")}`,
    });
    return this.normalizeTracks(data.result);
  },

  async getStreamUrl(trackId) {
    try {
      const data = await this.request(`/tracks/${trackId}/download-info`);
      if (!data.result || !data.result[0]) throw new Error("No download info");

      const sorted = data.result.sort(
        (a, b) => b.bitrate_in_kbps - a.bitrate_in_kbps,
      );
      const target = sorted[0];

      if (!target) throw new Error("No valid stream found");

      const srcUrl = target.downloadInfoUrl;
      const xmlText = await this.request(srcUrl, { isXml: true });

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      const host = xmlDoc.getElementsByTagName("host")[0]?.textContent;
      const path = xmlDoc.getElementsByTagName("path")[0]?.textContent;
      const ts = xmlDoc.getElementsByTagName("ts")[0]?.textContent;
      const s = xmlDoc.getElementsByTagName("s")[0]?.textContent;

      if (!host || !path || !ts || !s) throw new Error("Invalid XML format");

      const SALT = "XGRlBW9FXlekgbPrRHuSiA";
      const sign = md5(SALT + path.substring(1) + s);

      return `https://${host}/get-mp3/${sign}/${ts}${path}`;
    } catch (e) {
      console.error("Failed to get Yandex Stream URL", e);
      return null;
    }
  },

  normalizeTracks(rawTracks) {
    if (!Array.isArray(rawTracks)) return [];

    return rawTracks.map((t) => ({
      title: t.title,
      artist:
        t.artists && t.artists.length > 0
          ? t.artists.map((a) => a.name).join(", ")
          : "Unknown",
      album: t.albums && t.albums.length > 0 ? t.albums[0].title : "Single",
      file: `https://music.yandex.ru/album/${t.albums && t.albums[0] ? t.albums[0].id : 0}/track/${t.id}`,
      id: t.id,
      image: t.coverUri
        ? `https://${t.coverUri.replace("%%", "200x200")}`
        : null,
      time: t.durationMs ? t.durationMs / 1000 : 0,
      genre: "Yandex Music",
      isYandex: true,
      stationName: null,
    }));
  },
};
