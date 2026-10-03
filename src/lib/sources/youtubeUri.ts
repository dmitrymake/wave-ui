// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export function isYoutubeVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID.test(value);
}

/** Only our stable MPD URLs/URIs belong to this source, never arbitrary YouTube links. */
export function getYoutubeIdFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(?:youtube:|http:\/\/127\.0\.0\.1:8766\/youtube\/stream\/)([A-Za-z0-9_-]{11})$/);
  return match?.[1] ?? null;
}

export function youtubeStreamUrl(id: string): string {
  if (!isYoutubeVideoId(id)) throw new Error("Invalid YouTube Music track id");
  return `http://127.0.0.1:8766/youtube/stream/${id}`;
}
