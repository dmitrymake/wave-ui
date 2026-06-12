// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { API_ENDPOINTS } from "./constants";
import { isRemoteUrl, normalizeForMatch } from "./utils";
import type { Station } from "./types";

// Radio/Station-specific helpers, split out of the generic utils grab-bag so the
// internet-radio matching/imaging logic lives in one place. Generic string helpers
// (isRemoteUrl, normalizeForMatch) are imported from utils rather than duplicated.

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
