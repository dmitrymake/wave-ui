// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable } from "svelte/store";
import type { Station, Playlist, Track } from "../types";

// Navigation lives in ./navigation — import from there (or via ../store).
// Former re-exports were removed to keep the dependency graph explicit:
// `store.ts` re-exports ./navigation directly, so importing navigation through
// ./library hid the real origin of `navigationStack`/`navigateTo`.

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
