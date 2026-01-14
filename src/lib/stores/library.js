import { writable, get } from "svelte/store";

// --- LIBRARY DATA ---
export const stations = writable([]);
export const playlists = writable([]);
export const activePlaylistTracks = writable([]);
export const activePlaylistName = writable(null);
export const favorites = writable(new Set());
export const selectedStationName = writable(null);

// --- LOADING FLAGS ---
export const isLoadingRadio = writable(false);
export const isLoadingPlaylists = writable(false);
export const isLoadingTracks = writable(false);
export const isSyncingLibrary = writable(false);

// --- NAVIGATION & ROUTER ---
export const navigationStack = writable([{ view: "root" }]);
export const ignoreNextPopState = writable(false);
export const searchQuery = writable("");
export const scrollPositions = writable({});

let pendingRouteData = null;
let onNavigateCallback = null;

export function setNavigationCallback(fn) {
  onNavigateCallback = fn;
}

export function navigateTo(view, data = null) {
  if (data) pendingRouteData = data;

  navigationStack.update((stack) => [...stack, { view, data }]);

  if (onNavigateCallback) {
    onNavigateCallback(view, data);
  }
}

export function consumeRouteData() {
  const d = pendingRouteData;
  pendingRouteData = null;
  return d;
}

export function navigateBack() {
  const stack = get(navigationStack);
  if (stack.length > 1) {
    navigationStack.update((s) => s.slice(0, -1));
  } else {
    window.history.back();
  }
}

export function handleBrowserBack() {
  const stack = get(navigationStack);
  if (stack.length > 1) {
    navigationStack.update((s) => s.slice(0, -1));
  }
}

// --- SCROLL HELPERS ---
export function saveScrollPosition(key, pos) {
  scrollPositions.update((s) => ({ ...s, [key]: pos }));
}
export function getScrollPosition(key) {
  return get(scrollPositions)[key] || 0;
}
