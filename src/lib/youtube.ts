// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { fetchWithTimeout } from "./http";
import { isRecord } from "./validate";
import { isYoutubeVideoId, youtubeStreamUrl } from "./sources/youtubeUri";
import type {
  YoutubeTrack, YoutubeCard, YoutubeResults, YoutubeDetails, YoutubeSection,
  YoutubeSearchFilter, YoutubeSettings, YoutubeStatus,
} from "./types/youtube";

// Same-origin PHP on both HTTP and HTTPS; Vite proxies this path in development.
export const YOUTUBE_ENDPOINT = "/wave-youtube-api.php";
export class YoutubeApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "YoutubeApiError";
  }
}

export function isYoutubeAuthError(error: unknown): boolean {
  return error instanceof YoutubeApiError && error.status === 401;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export function normalizeYoutubeTrack(value: unknown): YoutubeTrack | null {
  if (!isRecord(value) || !isYoutubeVideoId(value.id) || typeof value.title !== "string") return null;
  return {
    id: value.id, service: "youtube", file: youtubeStreamUrl(value.id),
    title: value.title, artist: typeof value.artist === "string" ? value.artist : "",
    album: typeof value.album === "string" ? value.album : "", genre: "", track: "",
    time: typeof value.time === "number" && Number.isFinite(value.time) ? Math.max(0, value.time) : 0,
    image: typeof value.image === "string" && value.image.startsWith("https://") ? value.image : undefined,
    artistId: optionalString(value.artistId), albumId: optionalString(value.albumId),
    liked: value.liked === true,
  };
}

function normalizeCards(value: unknown): YoutubeCard[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((card): YoutubeCard[] => {
    if (!isRecord(card) || typeof card.id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(card.id)
      || typeof card.title !== "string" || !["album", "artist", "playlist"].includes(String(card.kind))) return [];
    const key = `${card.kind}:${card.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: card.id, title: card.title, kind: card.kind as YoutubeCard["kind"],
      image: typeof card.image === "string" && card.image.startsWith("https://") ? card.image : undefined,
      subtitle: optionalString(card.subtitle),
      trackCount: typeof card.trackCount === "number" || typeof card.trackCount === "string" ? card.trackCount : undefined,
    }];
  });
}

function results(value: unknown): YoutubeResults {
  if (!isRecord(value)) throw new YoutubeApiError(502, "Invalid YouTube Music response");
  return {
    tracks: Array.isArray(value.tracks) ? value.tracks.flatMap((item) => {
      const track = normalizeYoutubeTrack(item);
      return track ? [track] : [];
    }) : [],
    cards: normalizeCards(value.cards),
    hiddenCount: typeof value.hiddenCount === "number" ? Math.max(0, value.hiddenCount) : 0,
  };
}

function details(value: unknown): YoutubeDetails {
  const base = results(value);
  if (!isRecord(value)) throw new YoutubeApiError(502, "Invalid YouTube Music response");
  return {
    ...base, title: optionalString(value.title) ?? "YouTube Music",
    image: optionalString(value.image),
    nextOffset: typeof value.nextOffset === "number" ? value.nextOffset : undefined,
    hasMore: value.hasMore === true,
    trackCount: typeof value.trackCount === "number" ? value.trackCount : undefined,
  };
}

function settings(value: unknown): YoutubeSettings {
  if (!isRecord(value) || typeof value.hideAiKeywords !== "boolean"
    || !Array.isArray(value.aiKeywords) || !value.aiKeywords.every((item) => typeof item === "string")
    || !Array.isArray(value.blockedArtists) || !value.blockedArtists.every((item) => typeof item === "string")) {
    throw new YoutubeApiError(502, "Invalid YouTube Music filter settings");
  }
  return { hideAiKeywords: value.hideAiKeywords, aiKeywords: value.aiKeywords, blockedArtists: value.blockedArtists };
}

export const YoutubeApi = {
  async request<T = unknown>(action: string, params: Record<string, unknown> = {}, method = "GET", timeoutMs = 60000, signal?: AbortSignal): Promise<T> {
    const url = new URL(YOUTUBE_ENDPOINT, window.location.origin);
    url.searchParams.set("action", action);
    const options: RequestInit = { method, signal };
    if (method === "GET") {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    } else {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(params);
    }
    const response = await fetchWithTimeout(url.toString(), options, timeoutMs);
    let body: unknown;
    try { body = await response.json(); } catch {
      throw new YoutubeApiError(response.ok ? 502 : response.status, "YouTube Music bridge is unavailable; update the moOde installation");
    }
    if (!response.ok || (isRecord(body) && "error" in body)) {
      throw new YoutubeApiError(response.ok ? 502 : response.status,
        isRecord(body) && typeof body.error === "string" ? body.error : "YouTube Music request failed");
    }
    if (!isRecord(body)) throw new YoutubeApiError(502, "Invalid YouTube Music response");
    return body as T;
  },

  async status(): Promise<YoutubeStatus> {
    const value = await this.request<YoutubeStatus>("status", {}, "GET", 30000);
    if (typeof value.authorized !== "boolean" || typeof value.playbackReady !== "boolean") {
      throw new YoutubeApiError(502, "Invalid YouTube Music connection status");
    }
    return value;
  },
  async search(query: string, filter: YoutubeSearchFilter = "songs"): Promise<YoutubeResults> {
    return results(await this.request("search", { query, filter }));
  },
  async home(): Promise<YoutubeSection[]> {
    const value = await this.request<{ sections: unknown[] }>("get_home");
    if (!Array.isArray(value.sections)) throw new YoutubeApiError(502, "Invalid YouTube Music home response");
    return value.sections.filter(isRecord).map((row) => ({ ...results(row), title: optionalString(row.title) ?? "Recommendations" }));
  },
  async playlists(): Promise<YoutubeCard[]> {
    const value = await this.request<{ cards: unknown[] }>("get_playlists");
    return normalizeCards(value.cards);
  },
  async playlist(id: string, offset = 0): Promise<YoutubeDetails> {
    return details(await this.request("get_playlist", { id, offset }));
  },
  async album(id: string): Promise<YoutubeDetails> {
    return details(await this.request("get_album", { id }));
  },
  async artist(id: string): Promise<YoutubeDetails> {
    return details(await this.request("get_artist", { id }));
  },
  async radio(id: string): Promise<YoutubeDetails> {
    return details(await this.request("get_radio", { id }));
  },
  async lyrics(id: string): Promise<{ lyrics: string | null; source?: string }> {
    return this.request("get_lyrics", { id });
  },
  async settings(): Promise<YoutubeSettings> {
    return settings(await this.request("get_settings"));
  },
  async saveSettings(value: YoutubeSettings): Promise<YoutubeSettings> {
    return settings(await this.request("save_settings", { ...value }, "POST"));
  },
};
