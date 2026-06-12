// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable, get } from "svelte/store";
import type { Readable } from "svelte/store";
import type { NavigationEntry } from "../types";


// Private writable: the ONLY place the navigation stack can be mutated. External
// callers must go through the sanctioned primitives below.
const _navigationStack = writable<NavigationEntry[]>([{ view: "root" }]);
// Readonly view exposed to the app. Components keep doing $navigationStack and
// get(navigationStack); .set/.update are intentionally absent so any stray
// external writer becomes a COMPILE error.
export const navigationStack: Readable<NavigationEntry[]> = { subscribe: _navigationStack.subscribe };
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

  _navigationStack.update((stack) => [...stack, { view, data: payload }]);

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
    _navigationStack.update((s) => s.slice(0, -1));
  } else {
    window.history.back();
  }
}

export function handleBrowserBack(): void {
  const stack = get(navigationStack);
  if (stack.length > 1) {
    _navigationStack.update((s) => s.slice(0, -1));
  }
}

// --- Sanctioned external stack primitives (the ONLY mutations allowed outside this module) ---

export function resetNavigation(): void {
  _navigationStack.set([{ view: "root" }]);
}

export function setNavigationStack(entries: NavigationEntry[]): void {
  _navigationStack.set(entries);
}

// Stack-only push WITHOUT browser-history side-effects (distinct from navigateTo).
export function pushNavigationEntry(view: string, data: Record<string, unknown> | null = null): void {
  _navigationStack.update((s) => [...s, { view, data }]);
}


export function saveScrollPosition(key: string, pos: number): void {
  scrollPositions.update((s) => ({ ...s, [key]: pos }));
}
export function getScrollPosition(key: string): number {
  return get(scrollPositions)[key] || 0;
}
