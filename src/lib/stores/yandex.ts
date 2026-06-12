// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable } from "svelte/store";
import type { YandexContext } from "../types/yandex";

let savedYandexEnabled = false;
try {
  savedYandexEnabled = localStorage.getItem("yandex_enabled") === "true";
} catch {}

export const isYandexEnabled = writable<boolean>(savedYandexEnabled);
isYandexEnabled.subscribe((val: boolean) => { try { localStorage.setItem("yandex_enabled", String(val)); } catch {} });

export const yandexAuthStatus = writable<boolean>(false);
export const yandexFavorites = writable<Set<string>>(new Set());
export const yandexSearchTrigger = writable<string | null>(null);

export const yandexContext = writable<YandexContext>({ streamCache: {} });

export const yandexState = writable<{ active: boolean; context_name: string }>({
  active: false,
  context_name: "Yandex Music",
});
