import { API_ENDPOINTS } from "./constants";

export function getStationImageUrl(station) {
  if (!station || !station.image) return null;

  if (station.image.startsWith("http")) {
    return station.image;
  }

  let filename = "";
  if (station.image === "local") {
    filename = `${station.name}.jpg`;
  } else {
    filename = station.image;
  }

  // Используем API_ENDPOINTS для построения полного URL
  return API_ENDPOINTS.RADIO_LOGOS(filename);
}

export function getCoverUrl(song) {
  if (!song || !song.file) return null;

  if (!song.file.startsWith("http")) {
    return API_ENDPOINTS.COVER_ART(song.file);
  }

  return null;
}

export function generateUid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
