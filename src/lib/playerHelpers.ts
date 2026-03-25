import { get } from "svelte/store";
import { ICONS } from "./icons";
import { LibraryActions } from "./mpd/library";
import { YandexApi } from "./yandex";
import { yandexFavorites, showToast } from "./store";
import { isRemoteUrl } from "./utils";
import { MSG } from "./messages";
import type { Track, MpdStatus } from "./types";

export function formatTime(seconds: number | null): string {
  if (seconds === null || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60) || 0;
  const s = Math.floor(seconds % 60) || 0;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getPct(e: MouseEvent | TouchEvent, element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const clientX = (e as TouchEvent).touches
    ? (e as TouchEvent).touches[0].clientX
    : (e as MouseEvent).clientX;
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

export async function cyclePlayMode(currentMode: number, MPD: MpdCommands): Promise<void> {
  const nextMode = (currentMode + 1) % 3;
  if (nextMode === 0) {
    if (currentMode === 1) MPD.toggleRandom();
    if (currentMode === 2) MPD.toggleRepeat();
  } else if (nextMode === 1) {
    MPD.toggleRandom();
  } else if (nextMode === 2) {
    MPD.toggleRandom();
    MPD.toggleRepeat();
  }
}

export async function toggleLike(track: Track): Promise<void> {
  if (!track.file && !track.id) return;

  if (track.isYandex || track.service === "yandex") {
    const liked = get(yandexFavorites).has(String(track.id));
    try {
      yandexFavorites.update((s) => {
        const id = String(track.id);
        if (liked) s.delete(id);
        else s.add(id);
        return s;
      });
      showToast(
        liked ? MSG.FAV_REMOVED_YANDEX : MSG.FAV_ADDED_YANDEX,
        liked ? "info" : "success",
      );
      await YandexApi.toggleLike(track.id!, liked);
    } catch (err) {
      showToast(MSG.FAV_ERROR_UPDATING, "error");
    }
  } else {
    LibraryActions.toggleFavorite(track);
  }
}

export function isTrackLiked(track: Track | null, favorites: Set<string>, yandexFavs: Set<string>): boolean {
  if (!track) return false;
  if (track.isYandex || track.service === "yandex") {
    return yandexFavs.has(String(track.id));
  }
  return !!track.file && favorites.has(track.file);
}

export function isRadioStream(song: Track | null): boolean {
  return !!isRemoteUrl(song?.file) && !song?.isYandex;
}

export function getQualityLabel(status: MpdStatus): string {
  return status.bitrate ? `${status.bitrate} kbps` : status.format || "";
}
