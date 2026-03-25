import { PlayerActions } from "./mpd/player";
import { LibraryActions } from "./mpd/library";
import { mpdClient } from "./mpd/client";
import { YandexApi } from "./yandex";
import {
  closeContextMenu,
  navigateTo,
  activePlaylistTracks,
  showModal,
  showToast,
} from "./store";
import { MSG } from "./messages";
import { logger } from "./logger";
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
  if (track) LibraryActions.toggleFavorite(track);
  closeContextMenu();
}

export function goToAlbum(track: Track | null): void {
  if (track && track.album) {
    if (!track.isYandex) {
      navigateTo("tracks_by_album", { name: track.album, artist: track.artist });
    }
  }
  closeContextMenu();
}

export function goToArtist(track: Track | null): void {
  if (track && track.artist) {
    if (!track.isYandex) {
      navigateTo("albums_by_artist", { name: track.artist });
    }
  }
  closeContextMenu();
}

export async function removeFromPlaylist(context: ContextMenuContext): Promise<void> {
  const { playlistName, index } = context;
  if (playlistName && index !== null && index !== undefined) {
    activePlaylistTracks.update((tracks: Track[]) => {
      const copy = [...tracks];
      copy.splice(index, 1);
      return copy;
    });
    await LibraryActions.removeFromPlaylist(playlistName, index);
  }
  closeContextMenu();
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
    mpdClient
      .send("stop")
      .then(() => mpdClient.send("clear"))
      .then(() => mpdClient.send(`load "${pl.name.replace(/"/g, '\\"')}"`))
      .then(() => mpdClient.send("play 0"));
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
  if (track && track.isYandex && track.id) {
    showToast(MSG.startingRadio(track.title), "info");
    try {
      await YandexApi.playRadio(track.id, "track");
    } catch (e) {
      logger.error(e);
      showToast(MSG.RADIO_ERROR_STARTING, "error");
    }
  }
  closeContextMenu();
}

export async function radioByArtist(track: Track | null): Promise<void> {
  if (track && track.isYandex && track.artist) {
    showToast(MSG.searchingArtist(track.artist), "info");
    try {
      const searchRes = await YandexApi.search(track.artist);
      if (searchRes && searchRes.artists && searchRes.artists.length > 0) {
        const artistId = searchRes.artists[0].id;
        showToast(
          MSG.startingVibeFor(searchRes.artists[0].title),
          "info",
        );
        await YandexApi.playRadio(artistId, "artist");
      } else {
        showToast(MSG.RADIO_ARTIST_NOT_FOUND, "error");
      }
    } catch (e) {
      showToast(MSG.RADIO_FAILED_ARTIST_VIBE, "error");
    }
  }
  closeContextMenu();
}

export async function addToPlaylist(track: Track | null, playlistName: string): Promise<void> {
  if (!track) return;
  try {
    const safePl = playlistName.replace(/"/g, '\\"');
    const safeFile = track.file.replace(/"/g, '\\"');
    await mpdClient.send(`playlistadd "${safePl}" "${safeFile}"`);
    showToast(MSG.addedToPlaylist(playlistName), "success");
    closeContextMenu();
  } catch (e) {
    logger.error(e);
    showToast(MSG.PLAY_FAILED_TO_ADD, "error");
  }
}
