import { writable } from "svelte/store";

// --- ALARM ---
const savedAlarmTime = localStorage.getItem("alarmTime") || "08:00";
const savedAlarmEnabled = localStorage.getItem("alarmEnabled") === "true";
const savedAlarmPlaylist = localStorage.getItem("alarmPlaylist") || "Favorites";

export const alarmTime = writable(savedAlarmTime);
export const isAlarmEnabled = writable(savedAlarmEnabled);
export const alarmPlaylist = writable(savedAlarmPlaylist);

alarmTime.subscribe((val) => localStorage.setItem("alarmTime", val));
isAlarmEnabled.subscribe((val) =>
  localStorage.setItem("alarmEnabled", String(val)),
);
alarmPlaylist.subscribe((val) => localStorage.setItem("alarmPlaylist", val));

// --- YANDEX TOGGLE ---
const savedYandexEnabled = localStorage.getItem("yandex_enabled") === "true";
export const isYandexEnabled = writable(savedYandexEnabled);

isYandexEnabled.subscribe((val) => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("yandex_enabled", String(val));
  }
});
