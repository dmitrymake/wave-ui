// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// ─── Track & Music Data ───

export interface Track {
  file: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  time: number;
  track: string;
  id?: string;
  pos?: string | null;
  stationName?: string | null;
  // Neutral identifier of the TrackSource that owns this track (e.g. the source's
  // `id`). The core never hard-codes a concrete service; capabilities are resolved
  // from the registry via this field. Absent for plain local-library tracks.
  service?: string;
  image?: string;
  cover?: string;
  thumbHash?: string;
  qualityBadge?: string;
  album_artist?: string;
  disc?: string;
  year?: number;
  _uid?: string;
  playlistPos?: number;
}

// Minimal shape the artwork resolver (cover/thumb URLs) reads off a row. Track,
// LibraryItem and SearchAlbumResult all satisfy it structurally, so artwork
// helpers accept any of them without an `as unknown as Track` cast.
export interface ArtworkSource {
  file?: string;
  image?: string;
  cover?: string;
  genre?: string;
  title?: string;
  stationName?: string | null;
  thumbHash?: string;
}

export interface MpdStatus {
  state: "play" | "pause" | "stop";
  volume: number;
  elapsed: number;
  duration: number;
  random: boolean;
  repeat: boolean;
  song: number;
  songId: number;
  playlistLength: number;
  bitrate: number;
  format: string;
  playlistVersion: number;
}

export interface CurrentSong extends Track {}

// ─── Radio & Stations ───

export interface Station {
  id: number | string;
  name: string;
  file: string;
  station: string;
  image: string;
  genre: string;
  url?: string;
}

// ─── Playlists ───

export interface Playlist {
  name: string;
  lastModified?: string;
  color?: string;
  colorVar?: string;
}

// ─── UI State ───

export interface ToastMessage {
  text: string;
  type: "info" | "success" | "error";
}

export interface ModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: ((value?: string) => void) | null;
  type: "confirm" | "prompt" | "alert" | "select";
  inputValue: string;
  placeholder: string;
  options: { label: string; value: string }[];
}

export interface ContextMenuState {
  isOpen: boolean;
  track: Track | null;
  context: ContextMenuContext;
  x: number;
  y: number;
  triggerRect: DOMRect | null;
}

export interface ContextMenuContext {
  type: "general" | "queue" | "playlist" | "playlist-card";
  playlistName?: string | null;
  index?: number | null;
  source?: string;
  playlist?: Playlist;
}

// ─── Themes ───

export interface Theme {
  id: string;
  label: string;
  colors: Record<string, string>;
}

// ─── Menu Positioner ───

export interface MenuPositionConfig {
  isOpen: boolean;
  triggerRect: DOMRect | null;
  x: number;
  y: number;
  menuWidth: number;
  menuHeight: number;
  innerWidth: number;
  innerHeight: number;
  isMiniPlayerSource: boolean;
}

// ─── Library View ───

export interface LibraryItem {
  name?: string;
  title?: string;
  artist?: string;
  // Present on `tracks_by_album` rows (which are spread from DbTrack at runtime);
  // absent on artist/album list rows. Used when bridging a row back to a Track.
  album?: string;
  track?: string;
  file?: string;
  displayName: string;
  thumbFile: string | null;
  year: string;
  _uid: string;
  isHeader?: boolean;
  time?: number;
  qualityBadge?: string;
  thumbHash?: string;
}

export interface SearchAlbumResult {
  name: string;
  artist: string;
  file: string;
  thumbHash?: string;
  _uid: string;
  year: string;
  qualityBadge?: string;
}

// ─── Database ───

export interface DbTrack extends Track {
  album_artist?: string;
  disc?: string;
  thumbHash?: string;
  qualityBadge?: string;
  year?: number;
  // Effective album-grouping artist (album_artist || artist), always defined so it
  // can back the composite [album, albumKey] index. Without it, IndexedDB would skip
  // records whose album_artist is undefined, and same-named albums by different
  // artists would still collapse into one card.
  albumKey?: string;
}
