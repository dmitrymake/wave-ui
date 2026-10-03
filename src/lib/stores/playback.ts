// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { writable } from "svelte/store";
import type { Track } from "../types";

export interface PendingPlayback {
  sequence: number;
  track: Track;
  position: number | null;
  phase: "preparing" | "starting";
}

/** The one user-selected track waiting for audio, independent of MPD's old song. */
export const pendingPlayback = writable<PendingPlayback | null>(null);
