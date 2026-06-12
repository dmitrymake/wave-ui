// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import type { Readable } from "svelte/store";
import type { Track, MpdStatus, CurrentSong, SourceRoute } from "../types";

export type { SourceRoute } from "../types";

/**
 * A long-running background daemon a source can expose (e.g. a streaming service
 * keeping a vibe/queue alive). Drives a reactive banner the UI shows while the
 * daemon is active, with controls to begin polling its state and to stop it.
 */
export interface DaemonBanner {
  /** Reactive banner data: whether the daemon is active and an optional label. */
  state: Readable<{ active: boolean; label: string | null }>;
  /** Begin periodic refresh of the daemon state; returns a stop() that clears the interval. */
  startPolling(): () => void;
  /** User pressed Stop -> stop the daemon. */
  stop(): Promise<void>;
}

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
   * Capability flag: tracks from this source carry a real elapsed/duration even
   * when their file looks like a remote stream. The player keeps ticking the
   * elapsed timer for them, unlike internet-radio streams (which have no fixed
   * duration and so freeze the timer).
   */
  readonly streamsHaveElapsed?: boolean;

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

  /** Is this track currently liked/favourited within this source? */
  isLiked?(track: Track): boolean;

  /** Toggle the like/favourite state of this track within this source. */
  toggleLike?(track: Track): Promise<void>;

  /**
   * Is this source track the one currently playing, given the MPD currentSong.file?
   * Encapsulates source-specific id matching (e.g. `yandex:<id>` list uris vs the
   * RAM-cache / CDN url the player actually reports). Lets the now-playing highlight
   * work in album/playlist/search views, not just the queue.
   */
  matchesPlaying?(track: Track, currentFile: string | null | undefined): boolean;

  /** Perform source-specific artist navigation for this track. */
  navigateToArtist?(track: Track): void;

  /** Brand glyph (SVG markup) shown next to tracks owned by this source. */
  readonly brandIcon?: string;

  /** Optional background daemon this source exposes (drives the now-playing banner). */
  daemon?: DaemonBanner;

  /**
   * Hash routes this source owns. The router resolves a route by its prefix
   * (parse) or by its view (serialize) and delegates the path<->data mapping to
   * the matched {@link SourceRoute}, so router.ts never hard-codes a service's
   * route literals.
   */
  readonly routes?: SourceRoute[];
}

const sources: TrackSource[] = [];

export function registerTrackSource(source: TrackSource): void {
  if (!sources.some((s) => s.id === source.id)) sources.push(source);
}

/** Read-only view of the registered sources, in registration order. */
export function listTrackSources(): readonly TrackSource[] {
  return sources;
}

export function resolveSource(fileOrUri: string | null | undefined): TrackSource | undefined {
  if (!fileOrUri) return undefined;
  return sources.find((s) => s.matches(fileOrUri));
}

/**
 * Resolve the source owning a track, preferring its neutral `service` tag (stamped
 * once at queue/parse time) and falling back to matching its file/uri. Use this when
 * you hold a Track and want its source without re-deriving from the raw path.
 */
export function resolveSourceForTrack(track: { service?: string; file?: string } | null | undefined): TrackSource | undefined {
  if (!track) return undefined;
  if (track.service) {
    const byId = sources.find((s) => s.id === track.service);
    if (byId) return byId;
  }
  return resolveSource(track.file);
}
