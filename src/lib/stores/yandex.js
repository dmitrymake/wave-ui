import { writable } from "svelte/store";

export const yandexAuthStatus = writable(false);
export const yandexFavorites = writable(new Set());
export const yandexSearchTrigger = writable(null);

export const yandexContext = writable({
  active: false,
  tracks: [],
  currentIndex: -1,
  currentTrackId: null,
  currentTrackFile: null,
  streamCache: {},
});

export const yandexState = writable({
  active: false,
  context_name: "Yandex Music",
});
