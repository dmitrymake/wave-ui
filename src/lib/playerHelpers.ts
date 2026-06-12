// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { ICONS } from "./icons";
import { LibraryActions } from "./mpd/library";
import { resolveSourceForTrack } from "./sources/trackSource";
import { isRemoteUrl, formatClock } from "./utils";
import type { Track, MpdStatus } from "./types";

// Thin alias kept for the player components; the clock format itself lives in utils.
export function formatTime(seconds: number | null): string {
  return formatClock(seconds);
}

export function getPct(e: MouseEvent | TouchEvent, element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  // A TouchList is truthy even when empty (e.g. on touchend), so guard on length
  // and fall back to changedTouches before the mouse coordinate.
  const te = e as TouchEvent;
  const point =
    te.touches && te.touches.length
      ? te.touches[0]
      : te.changedTouches && te.changedTouches.length
        ? te.changedTouches[0]
        : null;
  const clientX = point ? point.clientX : (e as MouseEvent).clientX;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

export function getVolumeIcon(volume: number): string {
  if (volume === 0) return ICONS.VOLUME_MUTE;
  if (volume < 50) return ICONS.VOLUME_MEDIUM;
  return ICONS.VOLUME_FULL;
}

export function getPlayMode(status: MpdStatus): number {
  return status.repeat ? 2 : status.random ? 1 : 0;
}

interface MpdCommands {
  toggleRandom(): void;
  toggleRepeat(): void;
}

export function cyclePlayMode(status: MpdStatus, MPD: MpdCommands): void {
  const nextMode = (getPlayMode(status) + 1) % 3;
  // Reconcile the real random/repeat flags to the target mode. Deriving from the
  // actual flags (rather than the collapsed 0/1/2 value) clears a both-on state
  // set elsewhere (e.g. via the moOde web UI) in a single step.
  const wantRandom = nextMode === 1;
  const wantRepeat = nextMode === 2;
  if (status.random !== wantRandom) MPD.toggleRandom();
  if (status.repeat !== wantRepeat) MPD.toggleRepeat();
}

export async function toggleLike(track: Track): Promise<void> {
  if (!track.file && !track.id) return;

  // A streaming source owns its own like flow (optimistic flip + rollback); the
  // local library falls back to the MPD favourites playlist.
  const source = resolveSourceForTrack(track);
  if (source?.toggleLike) {
    await source.toggleLike(track);
  } else {
    LibraryActions.toggleFavorite(track);
  }
}

// `yandexFavs` is passed so callers' reactive derivations re-run when streaming
// favourites change; the owning source reads the live set when computing isLiked.
export function isTrackLiked(track: Track | null, favorites: Set<string>, _yandexFavs: Set<string>): boolean {
  if (!track) return false;
  const source = resolveSourceForTrack(track);
  if (source?.isLiked) return source.isLiked(track);
  return !!track.file && favorites.has(track.file);
}

export function isRadioStream(song: Track | null): boolean {
  // A streaming-source track (real duration) is not internet radio even though its
  // file looks remote.
  if (!isRemoteUrl(song?.file)) return false;
  return !resolveSourceForTrack(song)?.streamsHaveElapsed;
}

export function getQualityLabel(status: MpdStatus): string {
  return status.bitrate ? `${status.bitrate} kbps` : status.format || "";
}
