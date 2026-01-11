import { API_ENDPOINTS } from "./constants";

export const YandexApi = {
  async request(action, params = {}) {
    const url = new URL(window.location.origin + API_ENDPOINTS.YANDEX);
    url.searchParams.append("action", action);

    for (const key in params) {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
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

  async getLanding() {
    return await this.request("get_landing");
  },

  async getArtistDetails(id) {
    return await this.request("get_artist_details", { id });
  },

  async getAlbumDetails(id) {
    return await this.request("get_album_details", { id });
  },

  // ИСПРАВЛЕНО: добавлен параметр offset
  async getPlaylistTracks(uid, kind, offset = 0) {
    return await this.request("get_playlist_tracks", { uid, kind, offset });
  },

  async getFavoritesIds() {
    return await this.request("get_favorites_ids");
  },

  async playRadio(trackId) {
    if (trackId) {
      return await this.request("play_station", {
        station: "track:" + trackId,
      });
    }
    return await this.request("play_station", { station: "user:onetwo" });
  },

  async playStation(stationId) {
    return await this.request("play_station", { station: stationId });
  },

  async playTrack(trackId) {
    return await this.request("play_track", { id: trackId });
  },

  async toggleLike(trackId, isLiked) {
    const action = isLiked ? "dislike" : "like";
    return await this.request(action, { track_id: trackId });
  },
};
