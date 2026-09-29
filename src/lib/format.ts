// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
/**
 * Micro-typography for UI copy: the small rules that keep a number with its
 * unit and a noun in agreement with its count. Display only.
 */

/** No-break space: between a number and its unit ("7 min", "320 kbps"). */
export const NBSP = " ";

/** The real ellipsis, for busy labels and truncated copy ("Playing…"). */
export const ELLIPSIS = "…";

/**
 * "1 track", "12 tracks" — the number bound to its noun by a no-break space,
 * so a wrapping line never leaves "12" at the end of one line and "tracks" at
 * the start of the next. `plural` defaults to singular + "s".
 */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count}${NBSP}${count === 1 ? singular : plural}`;
}

/** "320 kbps" with the unit bound to the number; "" for a missing rate. */
export function bitrateLabel(kbps: number | null | undefined): string {
  return kbps && kbps > 0 ? `${kbps}${NBSP}kbps` : "";
}
