// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { CONFIG } from "../config";
import type {
  YandexTrack,
  YandexPlaylist,
  YandexFavoritesIdsResponse,
  YandexLandingResponse,
  YandexStationsDashboardResponse,
  YandexArtistDetailsResponse,
  YandexAlbumDetailsResponse,
  YandexPlaylistTracksResponse,
  YandexSearchResponse,
  YandexMutationResponse,
} from "./types/yandex";

const getBaseUrl = (): string => {
  const isDev = import.meta.env.DEV;

  if (isDev) {
    return `http://${CONFIG.MOODE_IP}`;
  }

  if (typeof window !== "undefined" && window.location.port === "3000") {
    return `http://${window.location.hostname}`;
  }

  return "";
};

/** Yandex daemon API endpoint. Lives in the Yandex domain (was in shared constants). */
export const YANDEX_ENDPOINT = {
  get URL(): string {
    return `${getBaseUrl()}/wave-yandex-api.php`;
  },
};

/**
 * Pageable source descriptor for "Play All". Lets the daemon keep fetching
 * subsequent pages (favorites/playlists can have hundreds of tracks while the
 * UI only loads ~50 at a time). `offset` is where the daemon should continue.
 */
export interface PlaylistSource {
  kind: string;
  uid: string;
  offset: number;
}

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
  // Low-level escape hatch for actions without a typed wrapper (status, play_track,
  // add_tracks, …). The caller names the parsed shape via the type parameter; the
  // default of `unknown` keeps untyped callers honest about narrowing first.
  request<T = unknown>(action: string, params?: Record<string, unknown>, method?: string): Promise<T>;
  search(query: string): Promise<YandexSearchResponse>;
  getUserPlaylists(): Promise<YandexPlaylist[]>;
  getLanding(): Promise<YandexLandingResponse>;
  getStationsDashboard(): Promise<YandexStationsDashboardResponse>;
  getArtistDetails(id: string | number): Promise<YandexArtistDetailsResponse>;
  getAlbumDetails(id: string | number): Promise<YandexAlbumDetailsResponse>;
  getPlaylistTracks(uid: string, kind: string, offset?: number): Promise<YandexPlaylistTracksResponse>;
  getFavoritesIds(): Promise<YandexFavoritesIdsResponse>;
  playRadio(id?: string | number, type?: string): Promise<YandexMutationResponse>;
  playStation(stationId: string): Promise<YandexMutationResponse>;
  playTrack(trackId: string | number): Promise<YandexMutationResponse>;
  playPlaylist(tracks: YandexTrack[], contextName: string, source?: PlaylistSource | null): Promise<YandexMutationResponse>;
  addTracksToQueue(tracks: YandexTrack[]): Promise<YandexMutationResponse>;
  toggleLike(trackId: string | number | undefined, isLiked: boolean): Promise<YandexMutationResponse>;
  feedbackSkip(trackId: string | number, playedSeconds: number): Promise<YandexMutationResponse>;
}

export const YandexApi: YandexApiType = {
  async request<T = unknown>(action: string, params: Record<string, unknown> = {}, method = "GET"): Promise<T> {
    const baseUrl = YANDEX_ENDPOINT.URL;
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
    // res.json() is `any`; the caller's type parameter is the single point where we
    // assert the parsed payload's shape (the daemon's contract is external).
    return (await res.json()) as T;
  },

  async search(query: string): Promise<YandexSearchResponse> {
    return await this.request<YandexSearchResponse>("search", { query });
  },

  async getUserPlaylists(): Promise<YandexPlaylist[]> {
    return await this.request<YandexPlaylist[]>("get_playlists");
  },

  async getLanding(): Promise<YandexLandingResponse> {
    return await this.request<YandexLandingResponse>("get_landing");
  },

  async getStationsDashboard(): Promise<YandexStationsDashboardResponse> {
    return await this.request<YandexStationsDashboardResponse>("get_stations_dashboard");
  },

  async getArtistDetails(id: string | number): Promise<YandexArtistDetailsResponse> {
    return await this.request<YandexArtistDetailsResponse>("get_artist_details", { id });
  },

  async getAlbumDetails(id: string | number): Promise<YandexAlbumDetailsResponse> {
    return await this.request<YandexAlbumDetailsResponse>("get_album_details", { id });
  },

  async getPlaylistTracks(uid: string, kind: string, offset = 0): Promise<YandexPlaylistTracksResponse> {
    return await this.request<YandexPlaylistTracksResponse>("get_playlist_tracks", { uid, kind, offset });
  },

  async getFavoritesIds(): Promise<YandexFavoritesIdsResponse> {
    return await this.request<YandexFavoritesIdsResponse>("get_favorites_ids");
  },

  async playRadio(id?: string | number, type = "station"): Promise<YandexMutationResponse> {
    let stationId = "user:onyourwave";

    if (id) {
      if (type === "track") stationId = "track:" + id;
      else if (type === "artist") stationId = "artist:" + id;
      else if (type === "album") stationId = "album:" + id;
      else stationId = String(id);
    }

    return await this.request<YandexMutationResponse>("play_station", { station: stationId });
  },

  async playStation(stationId: string): Promise<YandexMutationResponse> {
    return await this.request<YandexMutationResponse>("play_station", { station: stationId });
  },

  async playTrack(trackId: string | number): Promise<YandexMutationResponse> {
    return await this.request<YandexMutationResponse>("play_track", { id: trackId });
  },

  async playPlaylist(tracks: YandexTrack[], contextName: string, source: PlaylistSource | null = null): Promise<YandexMutationResponse> {
    return await this.request<YandexMutationResponse>(
      "play_playlist",
      { tracks, context: contextName, source },
      "POST",
    );
  },

  async addTracksToQueue(tracks: YandexTrack[]): Promise<YandexMutationResponse> {
    return await this.request<YandexMutationResponse>("add_tracks", { tracks }, "POST");
  },

  async toggleLike(trackId: string | number | undefined, isLiked: boolean): Promise<YandexMutationResponse> {
    const action = isLiked ? "dislike" : "like";
    return await this.request<YandexMutationResponse>(action, { track_id: trackId });
  },

  async feedbackSkip(trackId: string | number, playedSeconds: number): Promise<YandexMutationResponse> {
    return await this.request<YandexMutationResponse>(
      "feedback_skip",
      { track_id: trackId, played_seconds: Math.max(0, Math.floor(playedSeconds)) },
      "POST",
    );
  },
};
