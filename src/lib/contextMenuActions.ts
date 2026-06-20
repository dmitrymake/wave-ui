// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { PlayerActions } from "./playback/player";
import { LibraryActions } from "./playback/library";
import { toggleLike as toggleLikeForTrack } from "./playerHelpers";
import { resolveSource, resolveSourceForTrack } from "./sources/trackSource";
import {
  closeContextMenu,
  navigateTo,
  activePlaylistTracks,
  showModal,
  showToast,
} from "./store";
import { MSG } from "./messages";
import type { Track, ContextMenuContext } from "./types.js";

export function playNext(track: Track | null): void {
  if (track) PlayerActions.playNext(track.file);
  closeContextMenu();
}

export function addToQueue(track: Track | null): void {
  if (track) PlayerActions.addToQueue(track.file);
  closeContextMenu();
}

export function toggleLike(track: Track | null): void {
  // Route through the source-aware helper so a Yandex row toggles its real liked
  // state instead of always poking the MPD Favorites playlist.
  if (track) toggleLikeForTrack(track);
  closeContextMenu();
}

export function goToAlbum(track: Track | null): void {
  // Local-library navigation only; a streaming-source track has no local album view.
  if (track && track.album && !resolveSourceForTrack(track)) {
    navigateTo("tracks_by_album", { name: track.album, artist: track.artist });
  }
  closeContextMenu();
}

export function goToArtist(track: Track | null): void {
  if (track && track.artist && !resolveSourceForTrack(track)) {
    navigateTo("albums_by_artist", { name: track.artist });
  }
  closeContextMenu();
}

export async function removeFromPlaylist(context: ContextMenuContext): Promise<void> {
  const { playlistName, index } = context;
  try {
    if (playlistName && index !== null && index !== undefined) {
      let removed: Track | undefined;
      activePlaylistTracks.update((tracks: Track[]) => {
        const copy = [...tracks];
        removed = copy.splice(index, 1)[0];
        return copy;
      });
      const ok = await LibraryActions.removeFromPlaylist(playlistName, index);
      if (!ok && removed) {
        // Restore the optimistically-removed track so the view matches the server.
        activePlaylistTracks.update((tracks: Track[]) => {
          const copy = [...tracks];
          copy.splice(index, 0, removed as Track);
          return copy;
        });
      }
    }
  } catch {
    // A rejected request would otherwise leave the menu open with no feedback.
    showToast(MSG.PLAY_FAILED_REMOVE, "error");
  } finally {
    closeContextMenu();
  }
}

export function removeFromQueue(context: ContextMenuContext): void {
  const { index } = context;
  if (index !== null && index !== undefined) {
    PlayerActions.removeFromQueue(index);
  }
  closeContextMenu();
}

export function playlistPlay(context: ContextMenuContext): void {
  const pl = context.playlist;
  if (pl) {
    LibraryActions.playPlaylist(pl.name);
  }
  closeContextMenu();
}

export function playlistRename(context: ContextMenuContext): void {
  const pl = context.playlist;
  if (!pl) return;
  closeContextMenu();

  showModal({
    title: "Rename Playlist",
    message: `Enter new name for "${pl.name}":`,
    type: "prompt",
    placeholder: pl.name,
    inputValue: pl.name,
    confirmLabel: "Rename",
    onConfirm: (newName?: string) => {
      if (newName && newName !== pl.name) {
        LibraryActions.renamePlaylist(pl.name, newName);
      }
    },
  });
}

export function playlistDelete(context: ContextMenuContext): void {
  const pl = context.playlist;
  if (!pl) return;
  closeContextMenu();

  showModal({
    title: "Delete Playlist",
    message: `Are you sure you want to delete "${pl.name}"? This cannot be undone.`,
    type: "confirm",
    confirmLabel: "Delete",
    onConfirm: () => {
      LibraryActions.deletePlaylist(pl.name);
    },
  });
}

export async function radioByTrack(track: Track | null): Promise<void> {
  try {
    if (track) {
      await resolveSource(track.file)?.startRadioByTrack?.(track);
    }
  } catch {
    showToast(MSG.RADIO_ERROR_STARTING, "error");
  } finally {
    closeContextMenu();
  }
}

export async function radioByArtist(track: Track | null): Promise<void> {
  try {
    if (track) {
      await resolveSource(track.file)?.startRadioByArtist?.(track);
    }
  } catch {
    showToast(MSG.RADIO_ERROR_STARTING, "error");
  } finally {
    closeContextMenu();
  }
}

export async function addToPlaylist(track: Track | null, playlistName: string): Promise<void> {
  if (!track) return;
  try {
    await LibraryActions.addToPlaylist(track, playlistName);
  } catch {
    showToast(MSG.PL_FAILED_ADD, "error");
  } finally {
    closeContextMenu();
  }
}
