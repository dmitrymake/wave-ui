// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
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

/**
 * Extract the Yandex Music track id from any of the URI/file forms it can take:
 * the `yandex:<id>` metadata uri used in source lists, the cached RAM path
 * `/dev/shm/yandex_music/tracks/<id>.<ext>`, or a CDN stream URL. Returns null
 * when no id can be found (i.e. not a Yandex track).
 */
export function getYandexIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let match: RegExpMatchArray | null = url.match(/^yandex:(\d+)$/);
  if (match) return match[1];
  match = url.match(/\/tracks\/(\d+)\.\w+/);
  if (match) return match[1];
  match = url.match(/[?&]track-id=([^&]+)/);
  if (match) return match[1];
  match = url.match(/[?&]id=([^&]+)/);
  if (match) return match[1];
  match = url.match(/\/track\/(\d+)/);
  if (match) return match[1];
  return null;
}

export function normalizeForMatch(str: string | null | undefined): string {
  return (str || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findStationByStream(
  stationList: Station[],
  songFile: string | null | undefined,
  songTitle: string | null | undefined,
): Station | undefined {
  const targetUrl = normalizeForMatch(songFile);
  const targetTitle = normalizeForMatch(songTitle);

  return stationList.find((s) => {
    const sUrl = normalizeForMatch(s.station || s.file || s.url);
    const sName = normalizeForMatch(s.name);
    return (
      (sUrl && targetUrl.includes(sUrl)) ||
      (sName && targetTitle.includes(sName))
    );
  });
}

export function findStationByName(
  stationList: Station[],
  trackTitle: string | null | undefined,
  trackStationName: string | null | undefined,
  selectedRadioName: string | null | undefined,
): Station | undefined {
  const targetTitle = normalizeForMatch(trackTitle);
  const targetStationName = normalizeForMatch(trackStationName);
  const targetSelected = normalizeForMatch(selectedRadioName);

  return stationList.find((s) => {
    const sName = normalizeForMatch(s.name);
    if (!sName) return false;
    return (
      sName === targetStationName ||
      sName === targetSelected ||
      (targetTitle && sName === targetTitle) ||
      (targetTitle && targetTitle.includes(sName) && sName.length > 3)
    );
  });
}
