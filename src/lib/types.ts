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
  isYandex?: boolean;
  service?: string;
  image?: string;
  cover?: string;
  thumbHash?: string;
  qualityBadge?: string;
  album_artist?: string;
  disc?: string;
  year?: number;
  _uid?: string;
  mpdId?: string;
  mpdPos?: string;
  playlistPos?: number;
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

export interface CurrentSong extends Track {
  isYandex?: boolean;
}

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

// ─── Navigation ───

export interface NavigationEntry {
  view: string;
  data?: Record<string, unknown> | null;
}

// ─── Themes ───

export interface Theme {
  id: string;
  label: string;
  colors: Record<string, string>;
}

// ─── Yandex ───

export interface YandexTrack {
  id: string | number;
  title: string;
  artist: string;
  album?: string;
  image?: string;
  time?: number;
  isYandex: true;
}

export interface YandexAlbum {
  id: string | number;
  title: string;
  artist?: string;
  image?: string;
  year?: number;
}

export interface YandexArtist {
  id: string | number;
  title: string;
  image?: string;
  description?: string;
}

export interface YandexPlaylist {
  uid: string;
  kind: string;
  title: string;
  cover?: string;
  trackCount?: number | string;
  id?: string;
  bgColor?: string;
  isStation?: boolean;
}

export interface YandexContext {
  active: boolean;
  tracks: YandexTrack[];
  currentIndex: number;
  currentTrackId: string | null;
  currentTrackFile: string | null;
  streamCache: Record<string, YandexTrack & { file: string }>;
}

export interface YandexSearchResults {
  tracks: YandexTrack[];
  albums: YandexAlbum[];
  artists: YandexArtist[];
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

// ─── Yandex Content Header ───

export type YandexHeaderData = (YandexPlaylist | YandexArtist | YandexAlbum) & {
  name?: string;
  cover?: string;
  kind?: string;
  description?: string;
} | null;

// ─── Database ───

export interface DbTrack extends Track {
  album_artist?: string;
  disc?: string;
  thumbHash?: string;
  qualityBadge?: string;
  year?: number;
}
