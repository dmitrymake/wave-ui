// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import type { Track, MpdStatus, CurrentSong } from "../types";

/**
 * A pluggable source of playable tracks (local MPD library, internet radio, or a
 * streaming service such as Yandex). The generic player/MPD layer resolves the
 * source that owns a given file/uri and delegates all service-specific behaviour
 * to it, so the core never depends on a concrete service.
 */
export interface TrackSource {
  readonly id: string;

  /** Does this source own the given MPD file path / uri? */
  matches(fileOrUri: string): boolean;

  /**
   * Enrich a freshly-parsed queue track from this source's cache. Returns the
   * enriched track on a cache hit, or null on a miss (pushing the file to
   * `toFetch` so the caller can request its metadata asynchronously).
   */
  enrichQueueTrack?(track: Track, toFetch: string[]): Track | null;

  /** Fetch metadata for queue files that missed the cache and patch the stores. */
  fetchQueueMeta?(urls: string[]): void;

  /** Enrich the current song in place from cache (may schedule an async fetch). */
  enrichCurrentSong?(song: CurrentSong, status: MpdStatus): void;

  /** Play a uri this source owns. Returns true if fully handled. */
  playUri?(uri: string, currentPos: number): Promise<boolean>;

  /** Append a uri this source owns to the queue. Returns true if handled. */
  addToQueue?(uri: string): Promise<boolean>;

  /** Insert a uri this source owns right after the current track. Returns true if handled. */
  playNext?(uri: string, currentPos: number): Promise<boolean>;

  /** Report that a track from this source was skipped after `elapsed` seconds. */
  onSkip?(track: Track | CurrentSong, elapsed: number): void;

  /** Whether next/prev should advance the MPD queue rather than cycle radio stations. */
  isQueueNavigable?(song: CurrentSong): boolean;

  /** Start a radio/vibe seeded by a track. */
  startRadioByTrack?(track: Track): Promise<void>;

  /** Start a radio/vibe seeded by a track's artist. */
  startRadioByArtist?(track: Track): Promise<void>;
}

const sources: TrackSource[] = [];

export function registerTrackSource(source: TrackSource): void {
  if (!sources.some((s) => s.id === source.id)) sources.push(source);
}

export function resolveSource(fileOrUri: string | null | undefined): TrackSource | undefined {
  if (!fileOrUri) return undefined;
  return sources.find((s) => s.matches(fileOrUri));
}
