import { get } from "svelte/store";
import { yandexToken } from "./store";
import md5 from "md5";

export const YandexApi = {
  async request(path, options = {}) {
    const token = get(yandexToken);
    if (!token) throw new Error("No token provided");

    const proxyUrl = `/wave-api.php?action=yandex_proxy&path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;

    const headers = {
      Authorization: `OAuth ${token}`,
      "Accept-Language": "ru",
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

  async getPlaylistTracks(kind, uid = null) {
    try {
      if (!uid) uid = await this.getUserId();
      const data = await this.request(`/users/${uid}/playlists/${kind}`);

      const res = data.result;
      if (!res || !res.tracks) return [];

      const ids = res.tracks.map((t) => t.id);
      const slice = ids.slice(0, 100);
      return await this.getTracksByIds(slice);
    } catch (e) {
      console.error("Yandex Playlist Tracks Error:", e);
      return [];
    }
  },

  async getFavorites() {
    try {
      const uid = await this.getUserId();
      const data = await this.request(`/users/${uid}/likes/tracks`);

      let ids = [];
      const res = data.result;

      if (!res) return [];

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

      if (ids.length === 0) return [];

      const slice = ids.slice(0, 100);
      return await this.getTracksByIds(slice);
    } catch (e) {
      console.error("Yandex Favorites Error:", e);
      return [];
    }
  },

  async search(query) {
    if (!query) return [];
    try {
      const data = await this.request(
        `/search?text=${encodeURIComponent(query)}&type=track&page=0`,
      );
      const tracks =
        data.result && data.result.tracks ? data.result.tracks.results : [];
      return this.normalizeTracks(tracks);
    } catch (e) {
      console.error("Yandex Search Error:", e);
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

      // Sort by bitrate descending to get best quality
      const sorted = data.result.sort(
        (a, b) => b.bitrate_in_kbps - a.bitrate_in_kbps,
      );
      const target = sorted[0]; // Best quality

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
      artist: t.artists ? t.artists.map((a) => a.name).join(", ") : "Unknown",
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
