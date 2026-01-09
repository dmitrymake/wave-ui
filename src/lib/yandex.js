import { API_ENDPOINTS } from "./constants";

export const YandexApi = {
  async request(action, params = {}) {
    const url = new URL(window.location.origin + API_ENDPOINTS.YANDEX);
    url.searchParams.append("action", action);

    for (const key in params) {
      url.searchParams.append(key, params[key]);
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error("API Error");
    return await res.json();
  },

  async search(query) {
    return await this.request("search", { query });
  },

  async getUserPlaylists() {
    return await this.request("get_playlists");
  },

  async playRadio(trackId) {
    return await this.request("play_station", { station: "user:onetwo" });
  },

  async playStation(stationId) {
    return await this.request("play_station", { station: stationId });
  },

  async getFavorites(page = 0) {
    // Пока заглушка или реализация через прокси, если нужно
    return { tracks: [], total: 0 };
  },

  async toggleLike(trackId, isLiked) {
    const action = isLiked ? "dislike" : "like";
    return await this.request(action, { track_id: trackId });
  },
};
