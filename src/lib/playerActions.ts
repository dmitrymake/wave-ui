// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
//
// Single gateway between the UI layer and the MPD protocol client. Components
// import their playback/queue/playlist actions from here instead of reaching
// into lib/mpd directly, so the raw protocol (escaping, command strings, the
// websocket client) stays encapsulated behind a typed action surface.
import { PlayerActions } from "./playback/player";
import { LibraryActions } from "./playback/library";
import { nav, playStation, playTrackOptimistic } from "./playback";

// Transport-level playback controls.
export const togglePlay = PlayerActions.togglePlay.bind(PlayerActions);
export const seek = PlayerActions.seek.bind(PlayerActions);
export const setVolume = PlayerActions.setVolume.bind(PlayerActions);
export const toggleRandom = PlayerActions.toggleRandom.bind(PlayerActions);
export const toggleRepeat = PlayerActions.toggleRepeat.bind(PlayerActions);

// Queue manipulation.
export const playQueuePosition = PlayerActions.playQueuePosition.bind(PlayerActions);
export const clearQueue = PlayerActions.clearQueue.bind(PlayerActions);
export const removeFromQueue = PlayerActions.removeFromQueue.bind(PlayerActions);
export const moveTrack = PlayerActions.moveTrack.bind(PlayerActions);
export const saveQueue = PlayerActions.saveQueue.bind(PlayerActions);
export const playAllTracks = PlayerActions.playAllTracks.bind(PlayerActions);
export const addAllToQueue = PlayerActions.addAllToQueue.bind(PlayerActions);

// Playlist management.
export const loadPlaylists = LibraryActions.loadPlaylists.bind(LibraryActions);
export const openPlaylistDetails = LibraryActions.openPlaylistDetails.bind(LibraryActions);
export const createEmptyPlaylist = LibraryActions.createEmptyPlaylist.bind(LibraryActions);
export const addPlaylistToQueue = LibraryActions.addPlaylistToQueue.bind(LibraryActions);
export const removeFromPlaylist = LibraryActions.removeFromPlaylist.bind(LibraryActions);
export const movePlaylistTrack = LibraryActions.movePlaylistTrack.bind(LibraryActions);

// Source-aware play helpers (handle radio/streaming/local routing internally).
export { nav, playStation, playTrackOptimistic };

// Shape consumed by playerHelpers.cyclePlayMode — exposes just the random/repeat
// toggles so the helper can reconcile the collapsed play-mode value.
export const PlayMode = {
  toggleRandom,
  toggleRepeat,
};
