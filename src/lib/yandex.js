import { API_ENDPOINTS } from "./constants";

export const YandexApi = {
  async request(action, params = {}, method = "GET") {
    const url = new URL(API_ENDPOINTS.YANDEX);
    url.searchParams.append("action", action);

    const options = { method };

    if (method === "GET") {
      for (const key in params) {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key]);
        }
      }
    } else {
      options.body = JSON.stringify(params);
      options.headers = { "Content-Type": "application/json" };
    }

    const res = await fetch(url.toString(), options);
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

  async getStationsDashboard() {
    return await this.request("get_stations_dashboard");
  },

  async getArtistDetails(id) {
    return await this.request("get_artist_details", { id });
  },

  async getAlbumDetails(id) {
    return await this.request("get_album_details", { id });
  },

  async getPlaylistTracks(uid, kind, offset = 0) {
    return await this.request("get_playlist_tracks", { uid, kind, offset });
  },

  async getFavoritesIds() {
    return await this.request("get_favorites_ids");
  },

  async playRadio(id, type = "station") {
    let stationId = "user:onyourwave";

    if (id) {
      if (type === "track") stationId = "track:" + id;
      else if (type === "artist") stationId = "artist:" + id;
      else if (type === "album")
        stationId = "album:" + id; // Редко используется, но поддерживается API
      else stationId = id; // Передан полный ID (например, user:onyourwave)
    }

    return await this.request("play_station", { station: stationId });
  },

  async playStation(stationId) {
    return await this.request("play_station", { station: stationId });
  },

  async playTrack(trackId) {
    return await this.request("play_track", { id: trackId });
  },

  async playPlaylist(tracks, contextName) {
    return await this.request(
      "play_playlist",
      { tracks, context: contextName },
      "POST",
    );
  },

  async addTracksToQueue(tracks) {
    return await this.request("add_tracks", { tracks }, "POST");
  },

  async toggleLike(trackId, isLiked) {
    const action = isLiked ? "dislike" : "like";
    return await this.request(action, { track_id: trackId });
  },
};
