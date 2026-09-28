// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Runtime guards for external JSON (PHP / Yandex / future YouTube Music).
// All `as`-casts on network data must go through here: invalid payloads degrade
// to defaults + warn instead of silently poisoning stores/queue.

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

export function asOptionalString(v: unknown): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

export function asOptionalNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Normalize raw stream meta to safe display values. Never throws. */
export function normalizeStreamMeta(
  url: string,
  meta: unknown,
): { id: string; title: string; artist: string; album?: string; image?: string; time?: number } | null {
  if (!isRecord(meta)) return null;
  const title = asString(meta.title);
  const artist = asString(meta.artist);
  // Drop rows with neither title nor artist — they would blank the queue row.
  if (!title && !artist) return null;
  return {
    id: asString(meta.id),
    title,
    artist,
    album: asOptionalString(meta.album),
    image: asOptionalString(meta.image),
    time: asOptionalNumber(meta.time),
  };
}

/** Radio station row from wave-api.php?action=stations. */
export function normalizeStation(item: unknown): {
  id: number | string;
  name: string;
  file: string;
  station: string;
  image: string;
  genre: string;
} | null {
  if (!isRecord(item)) return null;
  const name = asString(item.name);
  const station = asString(item.station);
  if (!name || !station) return null;
  const idRaw = item.id;
  const id: number | string =
    typeof idRaw === "number" || typeof idRaw === "string" ? idRaw : station;
  return {
    id,
    name,
    file: station,
    station,
    image: asString(item.logo),
    genre: asString(item.genre, "Radio"),
  };
}

/** Raw library row guard for the sync worker: must be an object with a file. */
export function isRawTrackData(v: unknown): v is Record<string, unknown> {
  return isRecord(v) && typeof (v as Record<string, unknown>).file === "string";
}
