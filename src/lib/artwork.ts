// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { getStationImageUrl, isRemoteUrl, findStationByName } from "./utils";
import { resolveSource } from "./sources/trackSource";
import { API_ENDPOINTS } from "./constants";
import md5 from "md5";
import type { Station, ArtworkSource } from "./types";

// Pure artwork-resolution logic, kept out of the player store so it belongs to the
// sources/utils layer instead of inverting it. The store now only wraps these in
// derived bindings; everything below is socket-free and directly unit-testable.

export function isRadioTrack(file: string): boolean {
  if (!file) return false;
  // A track owned by a streaming source (e.g. Yandex) is not internet radio.
  if (resolveSource(file)) return false;
  return isRemoteUrl(file) || file.includes("RADIO");
}

function resolveRadioImage(
  track: ArtworkSource | null,
  stationList: Station[],
  selectedRadioName: string | null,
): string | null {
  if (stationList && stationList.length > 0) {
    const found = findStationByName(stationList, track?.title, track?.stationName, selectedRadioName);
    if (found) return getStationImageUrl(found);
  }
  const fallbackName = track?.stationName || selectedRadioName;
  if (fallbackName) {
    return getStationImageUrl({ name: fallbackName, image: "local" });
  }
  return null;
}

// Artwork resolution shared by cover and thumb: a remote image/cover URL, or a
// radio-station image (with the caller's placeholder). Returns null for a normal
// library file so the caller can pick cover-art vs thumb-cache.
function resolveSharedArtwork(
  track: ArtworkSource | null,
  radioPlaceholder: string,
  stationList: Station[],
  selectedRadioName: string | null,
): string | null {
  if (!track) return null;
  if (isRemoteUrl(track.image)) return track.image!;
  if (isRemoteUrl(track.cover)) return track.cover!;

  if (track.file && (isRadioTrack(track.file) || track.genre === "Radio")) {
    if (track.image) {
      return (
        getStationImageUrl({
          name: track.stationName || track.title,
          image: track.image!,
        } as Pick<Station, "name" | "image">) || radioPlaceholder
      );
    }
    return resolveRadioImage(track, stationList, selectedRadioName) || radioPlaceholder;
  }

  return null;
}

export function getTrackCoverUrl(
  track: ArtworkSource | null,
  stationList: Station[] = [],
  selectedRadioName: string | null = null,
): string {
  const shared = resolveSharedArtwork(track, "/images/radio_placeholder.png", stationList, selectedRadioName);
  if (shared) return shared;

  if (!track || !track.file) return "/images/default_cover.png";

  return API_ENDPOINTS.COVER_ART(track.file);
}

export function getTrackThumbUrl(
  track: ArtworkSource | null,
  size: "sm" | "md" = "sm",
  stationList: Station[] = [],
  selectedRadioName: string | null = null,
): string {
  if (!track) return "/images/default_icon.png";

  const shared = resolveSharedArtwork(track, "/images/radio_icon.png", stationList, selectedRadioName);
  if (shared) return shared;

  if (!track.file) return "/images/default_icon.png";

  if (track.thumbHash) {
    return API_ENDPOINTS.THUMB_CACHE(track.thumbHash, size);
  }

  try {
    const lastSlashIndex = track.file.lastIndexOf("/");
    const dirPath =
      lastSlashIndex === -1 ? "." : track.file.substring(0, lastSlashIndex);
    const hash = md5(dirPath);
    return API_ENDPOINTS.THUMB_CACHE(hash, size);
  } catch (e) {
    return API_ENDPOINTS.COVER_ART(track.file);
  }
}
