/**
 * Icon Collection for Wave-UI Moode.
 * Strictly using existing files from ./lib/svg
 */

// Импортируем содержимое файлов как строки (Vite raw import)
import arrowsShuffle2 from "./svg/arrows-shuffle-2.svg?raw";
import brandDeezer from "./svg/brand-deezer.svg?raw";
import chevronCompactDown from "./svg/chevron-compact-down.svg?raw";
import chevronCompactLeft from "./svg/chevron-compact-left.svg?raw";
import chevronLeft from "./svg/chevron-left.svg?raw";
import disc from "./svg/disc.svg?raw";
import gripHorizontal from "./svg/grip-horizontal.svg?raw";
import heartEmpty from "./svg/heart-empty.svg?raw";
import heartFilled from "./svg/heart-filled.svg?raw";
import menu2 from "./svg/menu-2.svg?raw";
import music from "./svg/music.svg?raw";
import playerPause from "./svg/player-pause.svg?raw";
import playerPlayEmpty from "./svg/player-play-empty.svg?raw";
import playerPlayFilled from "./svg/player-play-filled.svg?raw";
import playerSkipBack from "./svg/player-skip-back.svg?raw";
import playerSkipForward from "./svg/player-skip-forward.svg?raw";
import playlist from "./svg/playlist.svg?raw";
import radio from "./svg/radio.svg?raw";
import refresh from "./svg/refresh.svg?raw";
import repeat from "./svg/repeat.svg?raw";
import search from "./svg/search.svg?raw";
import settings from "./svg/settings.svg?raw";
import trash from "./svg/trash.svg?raw";
import volumeFull from "./svg/volume-full.svg?raw";
import volumeMedium from "./svg/volume-medium.svg?raw";
import volumeMute from "./svg/volume-mute.svg?raw";
import volumeOff from "./svg/volume-off.svg?raw";
import x from "./svg/x.svg?raw";
import deviceFloppy from "./svg/device-floppy.svg?raw";
import filePencil from "./svg/file-pencil.svg?raw";
import plus from "./svg/plus.svg?raw";
import circleCheck from "./svg/circle-check.svg?raw";
import dots from "./svg/dots.svg?raw";

export const ICONS = {
  ARTISTS: music,
  ALBUMS: disc,
  GENRES: music,
  PLAYLISTS: playlist,
  RADIO: radio,
  SEARCH: search,

  PLAY: playerPlayFilled,
  PLAY_OUTLINE: playerPlayEmpty,
  PAUSE: playerPause,
  PREVIOUS: playerSkipBack,
  NEXT: playerSkipForward,
  SHUFFLE: arrowsShuffle2,
  REPEAT: repeat,

  VOLUME_FULL: volumeFull,
  VOLUME_MEDIUM: volumeMedium,
  VOLUME_MUTE: volumeMute,
  VOLUME_OFF: volumeOff,

  HEART: heartEmpty,
  HEART_FILLED: heartFilled,

  SYNC: refresh,
  SETTINGS: settings,
  CLOSE: x,
  MENU: menu2,
  BACK: chevronLeft,
  BACK_COMPACT: chevronCompactLeft,
  CHEVRON_DOWN: chevronCompactDown,
  DRAG_HANDLE: gripHorizontal,
  REMOVE: trash,
  DEEZER: brandDeezer,
  SAVE: deviceFloppy,
  EDIT: filePencil,
  ADD: plus,
  ACCEPT: circleCheck,

  // Новые для контекстного меню
  DOTS: dots,
  ADD_TO_PLAYLIST: plus,
  ALBUM_LINK: disc,
  ARTIST_LINK: music,
};
