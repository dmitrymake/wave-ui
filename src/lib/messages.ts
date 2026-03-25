export const MSG = {
  // Sync
  SYNC_REQUESTING: "Requesting library...",
  SYNC_DOWNLOADING: "Downloading data...",
  SYNC_PROCESSING: "Processing metadata...",
  SYNC_FAILED: "Sync Failed",
  SYNC_WORKER_CRASHED: "Sync worker crashed",

  // Playback
  PLAY_ADDED_TO_QUEUE: "Added to queue",
  PLAY_FAILED_TO_PLAY: "Failed to play",
  PLAY_FAILED_TO_ADD: "Failed to add",
  PLAY_ERROR_ADDING_TRACKS: "Error adding tracks",
  PLAY_WILL_PLAY_NEXT: "Will play next",
  PLAY_FAILED_SET_NEXT: "Failed to set next",
  PLAY_FAILED_REMOVE: "Failed to remove",
  PLAY_MOVE_FAILED: "Move failed",
  PLAY_PLAYING: "Playing...",
  PLAY_NO_TRACKS: "No tracks to play",
  PLAY_ERROR_STARTING: "Error starting playback",
  PLAY_NETWORK_ERROR: "Network error",
  PLAY_FAILED_OVERWRITE: "Failed to overwrite",

  // Playlist
  PL_DELETED: "Playlist deleted",
  PL_RENAMED: "Playlist renamed",
  PL_DELETE_FAILED: "Delete failed",
  PL_RENAME_FAILED: "Rename failed",
  PL_COULD_NOT_LOAD: "Could not load playlist",
  PL_FAILED_CREATE: "Failed to create playlist",
  PL_FAILED_ADD: "Failed to add to playlist",

  // Track
  TRACK_REMOVED: "Track removed",

  // Favorites
  FAV_REMOVED: "Removed from Favorites",
  FAV_ADDED: "Added to Favorites",
  FAV_ACTION_FAILED: "Action failed",
  FAV_REMOVED_YANDEX: "Removed from Yandex Likes",
  FAV_ADDED_YANDEX: "Added to Yandex Likes",
  FAV_ERROR_UPDATING: "Error updating like",

  // Radio
  RADIO_ERROR_STARTING: "Error starting radio",
  RADIO_ARTIST_NOT_FOUND: "Artist not found for Vibe",
  RADIO_FAILED_ARTIST_VIBE: "Failed to start Artist Vibe",
  RADIO_FAILED_LOAD: "Failed to load radio",
  RADIO_FAILED_START_VIBE: "Failed to start Vibe",

  // Settings
  SETTINGS_IP_SAVED: "IP Saved. Reloading...",
  SETTINGS_THEME_UPDATED: "Theme updated",
  SETTINGS_FAILED_ALARM_SYNC: "Failed to sync alarm settings",

  // Yandex
  YANDEX_CONNECTED: "Yandex connected successfully",
  YANDEX_INVALID_TOKEN: "Invalid token or server error",
  YANDEX_FAILED_DASHBOARD: "Failed to load dashboard",

  // Queue
  QUEUE_DAEMON_STOPPED: "Daemon stopped (Auto-fill disabled)",
  QUEUE_FAILED_STOP_DAEMON: "Failed to stop daemon",

  // App
  APP_DB_ERROR: "Local DB error. Please update library manually.",

  // Dynamic messages (functions)
  syncSaving: (count: number) => `Saving ${count} tracks...`,
  libraryUpdated: (count: number) => `Library updated: ${count} tracks`,
  syncFailed: (message: string) => `Sync Failed: ${message}`,
  playlistSaved: (name: string) => `Playlist "${name}" saved`,
  playlistOverwritten: (name: string) => `Playlist "${name}" overwritten`,
  playlistCreated: (name: string) => `Playlist "${name}" created`,
  addedToPlaylist: (name: string) => `Added to "${name}"`,
  playingTracks: (count: number) => `Playing ${count} tracks`,
  addedTracks: (count: number) => `Added ${count} tracks`,
  addingTracks: (count: number) => `Adding ${count} tracks...`,
  startingRadio: (title: string) => `Starting radio based on "${title}"...`,
  searchingArtist: (artist: string) => `Searching artist "${artist}"...`,
  startingVibeFor: (name: string) => `Starting Vibe for ${name}...`,
  startingContext: (name: string) => `Starting ${name}...`,
  startingVibe: (title: string) => `Starting vibe: ${title}`,
  startingMyVibe: "Starting My Vibe...",
  startingTypeVibe: (type: string) => `Starting ${type} Vibe...`,
  alarmSet: (time: string) => `Alarm set for ${time}`,
} as const;
