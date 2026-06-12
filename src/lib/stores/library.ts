// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable, get } from "svelte/store";
import type { Station, Playlist, Track, NavigationEntry } from "../types";


export const stations = writable<Station[]>([]);
export const playlists = writable<Playlist[]>([]);
export const activePlaylistTracks = writable<Track[]>([]);
export const activePlaylistName = writable<string | null>(null);
export const favorites = writable<Set<string>>(new Set());
export const selectedStationName = writable<string | null>(null);


export const isLoadingRadio = writable<boolean>(false);
export const isLoadingPlaylists = writable<boolean>(false);
export const isLoadingTracks = writable<boolean>(false);
export const isSyncingLibrary = writable<boolean>(false);


export const navigationStack = writable<NavigationEntry[]>([{ view: "root" }]);
export const ignoreNextPopState = writable<boolean>(false);
export const searchQuery = writable<string>("");
export const scrollPositions = writable<Record<string, number>>({});

let pendingRouteData: Record<string, unknown> | null = null;
let onNavigateCallback: ((view: string, data: Record<string, unknown> | null) => void) | null = null;

export function setNavigationCallback(fn: (view: string, data: Record<string, unknown> | null) => void): void {
  onNavigateCallback = fn;
}

// `data` is widened to `object` so callers can pass typed domain payloads
// (LibraryItem, Playlist, YandexPlaylist, …) without an index signature. It is
// stored/forwarded as Record<string, unknown> for views to narrow at the call site.
export function navigateTo(view: string, data: object | null = null): void {
  const payload = data as Record<string, unknown> | null;
  if (payload) pendingRouteData = payload;

  navigationStack.update((stack) => [...stack, { view, data: payload }]);

  if (onNavigateCallback) {
    onNavigateCallback(view, payload);
  }
}

export function consumeRouteData(): Record<string, unknown> | null {
  const d = pendingRouteData;
  pendingRouteData = null;
  return d;
}

export function navigateBack(): void {
  const stack = get(navigationStack);
  if (stack.length > 1) {
    navigationStack.update((s) => s.slice(0, -1));
  } else {
    window.history.back();
  }
}

export function handleBrowserBack(): void {
  const stack = get(navigationStack);
  if (stack.length > 1) {
    navigationStack.update((s) => s.slice(0, -1));
  }
}


export function saveScrollPosition(key: string, pos: number): void {
  scrollPositions.update((s) => ({ ...s, [key]: pos }));
}
export function getScrollPosition(key: string): number {
  return get(scrollPositions)[key] || 0;
}
