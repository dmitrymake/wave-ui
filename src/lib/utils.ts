// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Radio/Station helpers now live in ./radio; re-exported here so existing import
// paths (and their test mocks of "./utils") keep resolving unchanged.
export { getStationImageUrl, findStationByStream, findStationByName } from "./radio";
// Generic string helpers live in ./strings (a leaf with no intra-lib imports) to
// break the utils↔radio cycle; re-exported here so existing "./utils" paths resolve.
export { isRemoteUrl, normalizeForMatch } from "./strings";

export function generateUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Single source of truth for the "m:ss" clock format shown next to a track. A
// missing/NaN value renders "0:00" so a row never shows a blank or "NaN:NaN".
export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60) || 0;
  const s = total % 60 || 0;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Coarse "X hr Y min" / "Y min" summary used for a collection's total runtime
// (queue, playlist, album header). Empty string for a zero/unknown total so the
// caller can omit the line entirely.
export function formatTotalDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}
