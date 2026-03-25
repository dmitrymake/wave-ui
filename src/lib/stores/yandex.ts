import { writable } from "svelte/store";
import type { YandexContext } from "../types";

export const yandexAuthStatus = writable<boolean>(false);
export const yandexFavorites = writable<Set<string>>(new Set());
export const yandexSearchTrigger = writable<string | null>(null);

export const yandexContext = writable<YandexContext>({
  active: false,
  tracks: [],
  currentIndex: -1,
  currentTrackId: null,
  currentTrackFile: null,
  streamCache: {},
});

export const yandexState = writable<{ active: boolean; context_name: string }>({
  active: false,
  context_name: "Yandex Music",
});
