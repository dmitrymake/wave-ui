// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import type { Track } from "../types";

export type YoutubeSearchFilter = "songs" | "albums" | "artists" | "playlists" | "videos";
export type YoutubeCardKind = "album" | "artist" | "playlist";

export interface YoutubeTrack extends Track {
  id: string;
  service: "youtube";
  artistId?: string;
  albumId?: string;
  liked?: boolean;
}

export interface YoutubeCard {
  id: string;
  title: string;
  kind: YoutubeCardKind;
  image?: string;
  subtitle?: string;
  trackCount?: number | string;
}

export interface YoutubeResults {
  tracks: YoutubeTrack[];
  cards: YoutubeCard[];
  hiddenCount: number;
}

export interface YoutubeDetails extends YoutubeResults {
  title: string;
  image?: string;
  nextOffset?: number;
  hasMore?: boolean;
  trackCount?: number;
}

export interface YoutubeSection extends YoutubeResults {
  title: string;
}

export interface YoutubeSettings {
  hideAiKeywords: boolean;
  aiKeywords: string[];
  blockedArtists: string[];
}

export interface YoutubeStatus {
  authorized: boolean;
  accountName?: string;
  playbackReady: boolean;
}
