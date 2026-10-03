// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { writable } from "svelte/store";
import type { YoutubeStatus, YoutubeTrack } from "../types/youtube";

let enabled = false;
try { enabled = localStorage.getItem("youtube_enabled") === "true"; } catch {}
export const isYoutubeEnabled = writable(enabled);
isYoutubeEnabled.subscribe((value) => {
  try { localStorage.setItem("youtube_enabled", String(value)); } catch {}
});

export const youtubeStatus = writable<YoutubeStatus>({ authorized: false, playbackReady: false });
export const youtubeFavorites = writable<Set<string>>(new Set());
export const youtubeMeta = writable<Record<string, YoutubeTrack>>({});
export const youtubeSettingsVersion = writable(0);
