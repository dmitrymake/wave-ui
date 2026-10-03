// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { get } from "svelte/store";
import { YoutubeApi, isYoutubeAuthError } from "./youtube";
import { youtubeFavorites, youtubeStatus, youtubeMeta, youtubeSettingsVersion } from "./stores/youtube";
import { trimStreamCache } from "./sources/streamCache";
import { PlayerActions } from "./playback/player";
import { listTrackSources } from "./sources/trackSource";
import { showToast } from "./store";
import type { YoutubeStatus, YoutubeTrack } from "./types/youtube";

export function rememberYoutubeTracks(tracks: YoutubeTrack[]): void {
  youtubeMeta.update((cache) => trimStreamCache({ ...cache, ...Object.fromEntries(tracks.map((track) =>
    [track.id, { ...track, time: track.time || cache[track.id]?.time || 0 }])) }));
  youtubeFavorites.update((ids) => {
    const next = new Set(ids);
    for (const track of tracks) if (track.liked) next.add(track.id);
    return next;
  });
}

export const YoutubeService = {
  async checkAuth(): Promise<boolean> {
    try {
      const status = await YoutubeApi.status();
      youtubeStatus.set(status);
      return status.authorized;
    } catch {
      youtubeStatus.set({ authorized: false, playbackReady: false });
      return false;
    }
  },
  async saveAuth(auth: string): Promise<boolean> {
    try {
      const status = await YoutubeApi.request<YoutubeStatus>("save_auth", { auth }, "POST");
      youtubeMeta.set({});
      youtubeFavorites.set(new Set());
      youtubeStatus.set(status);
      youtubeSettingsVersion.update((n) => n + 1);
      showToast("YouTube Music connected", "success");
      void this.syncFavorites();
      return true;
    } catch (error) {
      // A failed replacement must not discard a previously valid saved session.
      showToast(error instanceof Error ? error.message : "YouTube Music connection failed", "error");
      return false;
    }
  },
  async disconnect(): Promise<void> {
    await YoutubeApi.request("disconnect", {}, "POST");
    youtubeStatus.set({ authorized: false, playbackReady: false });
    youtubeFavorites.set(new Set());
    youtubeMeta.set({});
  },
  async syncFavorites(): Promise<void> {
    if (!get(youtubeStatus).authorized) return;
    try {
      const response = await YoutubeApi.request<{ ids: string[] }>("get_favorites_ids");
      if (Array.isArray(response.ids)) youtubeFavorites.set(new Set(response.ids));
    } catch (error) {
      if (isYoutubeAuthError(error)) youtubeStatus.update((s) => ({ ...s, authorized: false }));
    }
  },
  async playTracks(tracks: YoutubeTrack[]): Promise<void> {
    if (!tracks.length) return;
    rememberYoutubeTracks(tracks);
    // Replacing the queue must stop another service's automatic refill first.
    await PlayerActions.playAllTracks(tracks, async () => { for (const source of listTrackSources()) {
      if (source.id !== "youtube" && source.daemon && get(source.daemon.state).active) {
        await source.daemon.stop();
        if (get(source.daemon.state).active) throw new Error("Could not stop the current radio session; try again");
      }
    } });
  },
  async startRadio(id: string): Promise<void> {
    const result = await YoutubeApi.radio(id);
    if (!result.tracks.length) throw new Error("No radio tracks remain after filtering");
    await this.playTracks(result.tracks);
  },
};
