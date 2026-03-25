import { writable } from "svelte/store";


const savedAlarmTime = localStorage.getItem("alarmTime") || "08:00";
const savedAlarmEnabled = localStorage.getItem("alarmEnabled") === "true";
const savedAlarmPlaylist = localStorage.getItem("alarmPlaylist") || "Favorites";

export const alarmTime = writable<string>(savedAlarmTime);
export const isAlarmEnabled = writable<boolean>(savedAlarmEnabled);
export const alarmPlaylist = writable<string>(savedAlarmPlaylist);

alarmTime.subscribe((val: string) => localStorage.setItem("alarmTime", val));
isAlarmEnabled.subscribe((val: boolean) =>
  localStorage.setItem("alarmEnabled", String(val)),
);
alarmPlaylist.subscribe((val: string) => localStorage.setItem("alarmPlaylist", val));


const savedYandexEnabled = localStorage.getItem("yandex_enabled") === "true";
export const isYandexEnabled = writable<boolean>(savedYandexEnabled);

isYandexEnabled.subscribe((val: boolean) => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("yandex_enabled", String(val));
  }
});
