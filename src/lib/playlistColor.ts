// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
//
// Single source of truth for playlist-cover colours and gradients.
// These are UI concerns (CSS background strings), kept out of playback/library so
// the MPD layer stays protocol-only. playback/library re-exports getGradient /
// assignColorVar for backward compatibility.

import { FAVORITES_PLAYLIST } from "./constants";

// The special-case Favorites swatch (default theme). Defined once here instead
// of being inlined as magic numbers across the three playlist views.
const FAV_HUE = 348;
const FAV_GRADIENT = `linear-gradient(135deg, hsl(${FAV_HUE}, 95%, 58%), hsl(${FAV_HUE}, 90%, 40%))`;
const FAV_COLOR_VAR = "var(--c-heart)";

const DEFAULT_CARD_BG = "var(--c-bg-card)";

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

/**
 * Stored gradient for a playlist cover (default theme). Favorites gets a fixed
 * red swatch; every other name is hashed to a deterministic dual-stop gradient.
 */
export function getGradient(name: string): string {
  if (name === FAVORITES_PLAYLIST) {
    return FAV_GRADIENT;
  }
  const hue: number = Math.abs(hashName(name) % 360);
  return `linear-gradient(135deg, hsl(${hue}, 60%, 40%), hsl(${(hue + 40) % 360}, 60%, 30%))`;
}

/**
 * Stored CSS custom-property colour for a playlist (used by the gruvbox theme).
 * Favorites maps to the heart colour; others cycle through --c-pl-0..5.
 */
export function assignColorVar(name: string): string {
  if (name === FAVORITES_PLAYLIST) return FAV_COLOR_VAR;
  const index: number = Math.abs(hashName(name) % 6);
  return `var(--c-pl-${index})`;
}

// The Favorites special-case is identical across all three views, so resolve it
// once. Returns the full `style` string, or null when the playlist is not
// Favorites and the caller should fall through to its own colour handling.
function favoriteCoverStyle(name: string | undefined, theme: string): string | null {
  if (name !== FAVORITES_PLAYLIST) return null;
  if (theme === "gruvbox") {
    return `background: linear-gradient(135deg, ${FAV_COLOR_VAR}, transparent); background-color: ${FAV_COLOR_VAR};`;
  }
  return `background: ${FAV_GRADIENT};`;
}

export interface PlaylistCoverInput {
  name?: string;
  color?: string;
  colorVar?: string;
}

export interface PlaylistCoverOptions {
  // Default-theme colour fallback chain. The header card prefers the gradient
  // (`color`), the grid cards prefer the solid var (`colorVar`); both fall back
  // to the card background. In practice loadPlaylists always sets both, so the
  // chain is mostly defensive — but it keeps the per-view output byte-identical.
  defaultFallback?: "color" | "colorVar";
  // When false, an empty colour is emitted verbatim (no card-bg placeholder),
  // matching the historical search-results cards.
  fallbackToDefault?: boolean;
}

/**
 * Resolves the `style` attribute string for a playlist cover, replacing the
 * gradient logic that was previously triplicated across the playlist views.
 */
export function getPlaylistCoverStyle(
  { name, color, colorVar }: PlaylistCoverInput,
  theme: string,
  { defaultFallback = "color", fallbackToDefault = true }: PlaylistCoverOptions = {},
): string {
  const fav = favoriteCoverStyle(name, theme);
  if (fav !== null) return fav;

  if (theme === "gruvbox") {
    const c = fallbackToDefault ? colorVar || color || DEFAULT_CARD_BG : colorVar;
    return `background: linear-gradient(135deg, ${c}, transparent); background-color: ${c};`;
  }

  const primary = defaultFallback === "colorVar" ? colorVar : color;
  const secondary = defaultFallback === "colorVar" ? color : colorVar;
  const c = fallbackToDefault ? primary || secondary || DEFAULT_CARD_BG : primary;
  return `background: ${c}`;
}
