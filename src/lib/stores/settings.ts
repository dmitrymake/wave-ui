// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable } from "svelte/store";


let savedAlarmTime = "08:00";
let savedAlarmEnabled = false;
let savedAlarmPlaylist = "Favorites";
let savedYandexEnabled = false;
try {
  savedAlarmTime = localStorage.getItem("alarmTime") || "08:00";
  savedAlarmEnabled = localStorage.getItem("alarmEnabled") === "true";
  savedAlarmPlaylist = localStorage.getItem("alarmPlaylist") || "Favorites";
  savedYandexEnabled = localStorage.getItem("yandex_enabled") === "true";
} catch {}

export const alarmTime = writable<string>(savedAlarmTime);
export const isAlarmEnabled = writable<boolean>(savedAlarmEnabled);
export const alarmPlaylist = writable<string>(savedAlarmPlaylist);
export const isYandexEnabled = writable<boolean>(savedYandexEnabled);

alarmTime.subscribe((val: string) => { try { localStorage.setItem("alarmTime", val); } catch {} });
isAlarmEnabled.subscribe((val: boolean) => { try { localStorage.setItem("alarmEnabled", String(val)); } catch {} });
alarmPlaylist.subscribe((val: string) => { try { localStorage.setItem("alarmPlaylist", val); } catch {} });
isYandexEnabled.subscribe((val: boolean) => { try { localStorage.setItem("yandex_enabled", String(val)); } catch {} });
