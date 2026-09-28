// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable, get } from "svelte/store";
import type { Readable } from "svelte/store";
import type { NavigationEntry, ViewName, NavData } from "../types";

// Private writable: the ONLY place the navigation stack can be mutated. External
// callers must go through the sanctioned primitives below.
const _navigationStack = writable<NavigationEntry[]>([{ view: "root" }]);
// Readonly view exposed to the app. Components keep doing $navigationStack and
// get(navigationStack); .set/.update are intentionally absent so any stray
// external writer becomes a COMPILE error.
export const navigationStack: Readable<NavigationEntry[]> = { subscribe: _navigationStack.subscribe };
export const searchQuery = writable<string>("");
export const scrollPositions = writable<Record<string, number>>({});

type RouteData = NavData | null;
// Last hash assigned by us (push). Browsers fire popstate for fragment
// navigations too, so the popstate handler must ignore events caused by our
// own assignments — hashchange owns those. Only a real traversal (browser
// Back/forward, hash different from what we set) is a Back.
let lastAssignedHash = "";
function normalizeHash(hash: string): string {
  return hash.startsWith("#") ? hash : `#${hash}`;
}
/** Assign location.hash, remembering it to recognize our own popstate. */
export function assignHash(hash: string): void {
  lastAssignedHash = normalizeHash(hash);
  window.location.hash = hash;
}
/** True when the current hash is what we assigned last (not a traversal). */
export function isOwnHashAssignment(): boolean {
  return normalizeHash(window.location.hash) === lastAssignedHash;
}
// Rich in-app payloads queued for hashchange. Some navigations never fire it
// (search uses replaceState; same-hash updates assign nothing), so entries are
// consumed by route identity (see consumeRouteDataFor), never by blind
// head-shift — otherwise a stale {query} leaks into an artist route and pushes
// an id-less details entry. Bounded against unbounded growth.
const MAX_PENDING = 20;
const pendingQueue: RouteData[] = [];
let onNavigateCallback: ((view: ViewName, data: RouteData) => void) | null = null;

export function setNavigationCallback(fn: (view: ViewName, data: RouteData) => void): void {
  onNavigateCallback = fn;
}

// `data` is widened to `object` so callers can pass typed domain payloads
// (LibraryItem, Playlist, YandexPlaylist, future YTMusicPlaylist, …) without an
// index signature. It is stored/forwarded as NavData for views to narrow.
export function navigateTo(view: ViewName, data: object | null = null): void {
  const payload = data as RouteData;
  const stack = get(navigationStack);
  const top = stack[stack.length - 1];
  // No-op when already there (e.g. re-clicking the same artist after its
  // header merged into the top entry): avoids a duplicate stack entry.
  if (top && isSameNavEntry(top.view, top.data, view, payload)) return;

  if (payload) {
    pendingQueue.push(payload);
    if (pendingQueue.length > MAX_PENDING) {
      pendingQueue.splice(0, pendingQueue.length - MAX_PENDING);
    }
  }

  _navigationStack.update((stack) => [...stack, { view, data: payload } as NavigationEntry]);

  if (onNavigateCallback) {
    onNavigateCallback(view, payload);
  }
}

/**
 * Consume the NEWEST queued payload matching the parsed hash route (by
 * navIdentityKey). Everything up to and including the match is superseded and
 * dropped with it. Null when nothing matches: the caller uses hash-parsed data.
 */
export function consumeRouteDataFor(
  view: string,
  parsed: Record<string, unknown> | null,
): RouteData {
  const key = navIdentityKey(view, parsed);
  for (let i = pendingQueue.length - 1; i >= 0; i--) {
    if (navIdentityKey(view, pendingQueue[i]) === key) {
      const match = pendingQueue[i];
      pendingQueue.splice(0, i + 1);
      return match;
    }
  }
  return null;
}

/** Peek without consuming (tests/diagnostics). */
export function pendingRouteDataCount(): number {
  return pendingQueue.length;
}

export function navigateBack(): void {
  const stack = get(navigationStack);
  if (stack.length > 1) {
    _navigationStack.update((s) => s.slice(0, -1));
  } else if (typeof window !== "undefined" && window.history) {
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
  pendingQueue.length = 0;
  _navigationStack.set([{ view: "root" }]);
}

export function setNavigationStack(entries: NavigationEntry[]): void {
  _navigationStack.set(entries);
}

// Stack-only push WITHOUT browser-history side-effects (distinct from navigateTo).
export function pushNavigationEntry(view: ViewName, data: RouteData = null): void {
  _navigationStack.update((s) => [...s, { view, data } as NavigationEntry]);
}

/**
 * Immutable top-entry update (replaces in-place `active.data = …` mutation,
 * which broke dedup + cache keys). Merges `patch` into the top entry's data.
 * Returns false when the stack is empty.
 */
export function updateTopEntry(patch: Record<string, unknown>): boolean {
  let updated = false;
  _navigationStack.update((stack) => {
    if (!stack.length) return stack;
    const top = stack[stack.length - 1];
    const merged = { ...(top.data ?? {}), ...patch };
    const next = [...stack];
    next[next.length - 1] = { ...top, data: merged } as NavigationEntry;
    updated = true;
    return next;
  });
  return updated;
}

/** Stable stringify for dedup: key order must not affect equality. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const rec = v as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(",")}}`;
}

function asIdPart(v: unknown): string | null {
  if (typeof v === "string" && v !== "") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Stable identity key for a view+data pair: the payload mutates after load
 * (header merges) and differs between rich in-app objects and lossy
 * hash-parsed ones, but the identity never changes. Shared by change
 * detection, cache keys and queue matching. Accepts both navigation view
 * names ("yandex_artist_details", …) and view-mode names ("artist_details", …).
 */
export function navIdentityKey(
  view: string,
  data: Record<string, unknown> | null | undefined,
): string {
  if (!data) return view;
  const details = /(^|_)artist_details$/.test(view) || /(^|_)album_details$/.test(view);
  if (details) {
    const id = asIdPart(data.id);
    if (id) return `${view}#${id}`;
  } else if (view === "yandex_playlist" || view === "playlist" || view === "details") {
    const uid = asIdPart(data.uid);
    const kind = asIdPart(data.kind);
    if (uid && kind) return `${view}#${uid}/${kind}`;
    const name = asIdPart(data.name);
    if (name) return `${view}#${name}`;
  } else if (view === "albums_by_artist") {
    const name = asIdPart(data.name);
    if (name) return `${view}#${name}`;
  } else if (view === "tracks_by_album") {
    const name = asIdPart(data.name);
    if (name) {
      const artist = asIdPart(data.artist);
      return artist ? `${view}#${artist}/${name}` : `${view}#${name}`;
    }
  } else if (view === "search" || /(^|_)search$/.test(view)) {
    return `${view}#${String(data.query ?? "")}`;
  }
  return `${view}#${stableStringify(data)}`;
}

/**
 * Same-view check for navigation entries: compares identities, not full
 * payloads, so a header-merged top entry still dedups against a fresh
 * navigation to the same content (no duplicate pushes on re-click).
 */
export function isSameNavEntry(
  viewA: string,
  dataA: Record<string, unknown> | null | undefined,
  viewB: string,
  dataB: Record<string, unknown> | null | undefined,
): boolean {
  if (viewA !== viewB) return false;
  if (!dataA && !dataB) return true;
  if (!dataA || !dataB) return false;
  return navIdentityKey(viewA, dataA) === navIdentityKey(viewB, dataB);
}

export function saveScrollPosition(key: string, pos: number): void {
  scrollPositions.update((s) => {
    // Bound growth: drop oldest when the map gets large (long sessions).
    const keys = Object.keys(s);
    if (keys.length > 200) {
      const trimmed: Record<string, number> = {};
      for (const k of keys.slice(-150)) trimmed[k] = s[k];
      return { ...trimmed, [key]: pos };
    }
    return { ...s, [key]: pos };
  });
}
export function getScrollPosition(key: string): number {
  return get(scrollPositions)[key] || 0;
}
