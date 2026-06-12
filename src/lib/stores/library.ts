// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable } from "svelte/store";
import type { Station, Playlist, Track } from "../types";

// Navigation concerns now live in ./navigation. Re-exported here so existing
// direct imports from ./stores/library keep resolving unchanged (barrel-preserving).
export {
  navigationStack,
  ignoreNextPopState,
  searchQuery,
  scrollPositions,
  setNavigationCallback,
  navigateTo,
  consumeRouteData,
  navigateBack,
  handleBrowserBack,
  saveScrollPosition,
  getScrollPosition,
  resetNavigation,
  setNavigationStack,
  pushNavigationEntry,
} from "./navigation";


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
