// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable } from "svelte/store";


let savedAlarmTime = "08:00";
let savedAlarmEnabled = false;
let savedAlarmPlaylist = "Favorites";
try {
  savedAlarmTime = localStorage.getItem("alarmTime") || "08:00";
  savedAlarmEnabled = localStorage.getItem("alarmEnabled") === "true";
  savedAlarmPlaylist = localStorage.getItem("alarmPlaylist") || "Favorites";
} catch {}

export const alarmTime = writable<string>(savedAlarmTime);
export const isAlarmEnabled = writable<boolean>(savedAlarmEnabled);
export const alarmPlaylist = writable<string>(savedAlarmPlaylist);

alarmTime.subscribe((val: string) => { try { localStorage.setItem("alarmTime", val); } catch {} });
isAlarmEnabled.subscribe((val: boolean) => { try { localStorage.setItem("alarmEnabled", String(val)); } catch {} });
alarmPlaylist.subscribe((val: string) => { try { localStorage.setItem("alarmPlaylist", val); } catch {} });
