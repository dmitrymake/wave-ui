import { API_ENDPOINTS } from "./constants";
import type { Station, Track } from "./types";

export function isRemoteUrl(url: string | null | undefined): boolean {
  return !!url && (url.startsWith("http") || url.includes("://"));
}

export function getStationImageUrl(station: Pick<Station, "name" | "image">): string | null {
  if (!station || !station.image) return null;

  if (isRemoteUrl(station.image)) {
    return station.image;
  }

  let filename = "";
  if (station.image === "local") {
    filename = `${station.name}.jpg`;
  } else {
    filename = station.image;
  }

  return API_ENDPOINTS.RADIO_LOGOS(filename);
}

export function getCoverUrl(song: Pick<Track, "file">): string | null {
  if (!song || !song.file) return null;

  if (!isRemoteUrl(song.file)) {
    return API_ENDPOINTS.COVER_ART(song.file);
  }

  return null;
}

export function generateUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
