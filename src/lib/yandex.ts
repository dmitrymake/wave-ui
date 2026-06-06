// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { API_ENDPOINTS } from "./constants";
import type { YandexTrack } from "./types";

/** Error thrown by YandexApi.request carrying the HTTP status for the caller. */
export class YandexApiError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message || `Yandex API error (${status})`);
    this.name = "YandexApiError";
    this.status = status;
  }
}

/** True when the failure looks like an expired/invalid token (needs reconnect). */
export function isYandexAuthError(e: unknown): boolean {
  return e instanceof YandexApiError && (e.status === 401 || e.status === 403);
}

interface YandexApiType {
  request(action: string, params?: Record<string, unknown>, method?: string): Promise<unknown>;
  search(query: string): Promise<unknown>;
  getUserPlaylists(): Promise<unknown>;
  getLanding(): Promise<unknown>;
  getStationsDashboard(): Promise<unknown>;
  getArtistDetails(id: string | number): Promise<unknown>;
  getAlbumDetails(id: string | number): Promise<unknown>;
  getPlaylistTracks(uid: string, kind: string, offset?: number): Promise<unknown>;
  getFavoritesIds(): Promise<unknown>;
  playRadio(id?: string | number, type?: string): Promise<unknown>;
  playStation(stationId: string): Promise<unknown>;
  playTrack(trackId: string | number): Promise<unknown>;
  playPlaylist(tracks: YandexTrack[], contextName: string): Promise<unknown>;
  addTracksToQueue(tracks: YandexTrack[]): Promise<unknown>;
  toggleLike(trackId: string | number | undefined, isLiked: boolean): Promise<unknown>;
  feedbackSkip(trackId: string | number, playedSeconds: number): Promise<unknown>;
}

export const YandexApi: YandexApiType = {
  async request(action: string, params: Record<string, unknown> = {}, method = "GET"): Promise<unknown> {
    const baseUrl = API_ENDPOINTS.YANDEX;
    const url = new URL(baseUrl, window.location.origin);

    url.searchParams.append("action", action);

    const options: RequestInit = { method };

    if (method === "GET") {
      for (const key in params) {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, String(params[key]));
        }
      }
    } else {
      options.body = JSON.stringify(params);
      options.headers = { "Content-Type": "application/json" };
    }

    const res = await fetch(url.toString(), options);
    if (!res.ok) throw new YandexApiError(res.status);
    return await res.json();
  },

  async search(query: string): Promise<unknown> {
    return await this.request("search", { query });
  },

  async getUserPlaylists(): Promise<unknown> {
    return await this.request("get_playlists");
  },

  async getLanding(): Promise<unknown> {
    return await this.request("get_landing");
  },

  async getStationsDashboard(): Promise<unknown> {
    return await this.request("get_stations_dashboard");
  },

  async getArtistDetails(id: string | number): Promise<unknown> {
    return await this.request("get_artist_details", { id });
  },

  async getAlbumDetails(id: string | number): Promise<unknown> {
    return await this.request("get_album_details", { id });
  },

  async getPlaylistTracks(uid: string, kind: string, offset = 0): Promise<unknown> {
    return await this.request("get_playlist_tracks", { uid, kind, offset });
  },

  async getFavoritesIds(): Promise<unknown> {
    return await this.request("get_favorites_ids");
  },

  async playRadio(id?: string | number, type = "station"): Promise<unknown> {
    let stationId = "user:onyourwave";

    if (id) {
      if (type === "track") stationId = "track:" + id;
      else if (type === "artist") stationId = "artist:" + id;
      else if (type === "album") stationId = "album:" + id;
      else stationId = String(id);
    }

    return await this.request("play_station", { station: stationId });
  },

  async playStation(stationId: string): Promise<unknown> {
    return await this.request("play_station", { station: stationId });
  },

  async playTrack(trackId: string | number): Promise<unknown> {
    return await this.request("play_track", { id: trackId });
  },

  async playPlaylist(tracks: YandexTrack[], contextName: string): Promise<unknown> {
    return await this.request(
      "play_playlist",
      { tracks, context: contextName },
      "POST",
    );
  },

  async addTracksToQueue(tracks: YandexTrack[]): Promise<unknown> {
    return await this.request("add_tracks", { tracks }, "POST");
  },

  async toggleLike(trackId: string | number | undefined, isLiked: boolean): Promise<unknown> {
    const action = isLiked ? "dislike" : "like";
    return await this.request(action, { track_id: trackId });
  },

  async feedbackSkip(trackId: string | number, playedSeconds: number): Promise<unknown> {
    return await this.request(
      "feedback_skip",
      { track_id: trackId, played_seconds: Math.max(0, Math.floor(playedSeconds)) },
      "POST",
    );
  },
};
