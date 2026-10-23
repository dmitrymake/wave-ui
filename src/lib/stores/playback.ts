// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { writable } from "svelte/store";
import type { Track } from "../types";

export interface PendingPlayback {
  sequence: number;
  track: Track;
  position: number | null;
  // A position can change while the provider prepares audio or the daemon prunes
  // its sliding window. This stable MPD identity confirms the selected occurrence.
  songId?: number;
  phase: "preparing" | "starting";
}

/** The one user-selected track waiting for audio, independent of MPD's old song. */
export const pendingPlayback = writable<PendingPlayback | null>(null);
