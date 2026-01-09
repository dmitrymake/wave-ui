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
      // Попытка прочитать текст ошибки от PHP
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
    // Проверка структуры ответа
    if (!data.result || !data.result.account) {
      throw new Error("Invalid response from Yandex: " + JSON.stringify(data));
    }
    return data.result.account.uid;
  },

  async getFavorites() {
    try {
      const uid = await this.getUserId();
      const data = await this.request(`/users/${uid}/likes/tracks`);

      const library = data.result.library;
      if (!library || library.length === 0) return [];

      const ids = library.map((item) => item.id).slice(0, 50);
      return await this.getTracksByIds(ids);
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
      const tracks = data.result.tracks ? data.result.tracks.results : [];
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
      const srcUrl = data.result[0].downloadInfoUrl;

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
      artist: t.artists.map((a) => a.name).join(", "),
      album: t.albums.length > 0 ? t.albums[0].title : "Single",
      file: `https://music.yandex.ru/album/${t.albums[0]?.id}/track/${t.id}`,
      id: t.id,
      image: t.coverUri
        ? `https://${t.coverUri.replace("%%", "200x200")}`
        : null,
      time: t.durationMs / 1000,
      genre: "Yandex Music",
      isYandex: true,
      stationName: null,
    }));
  },
};
