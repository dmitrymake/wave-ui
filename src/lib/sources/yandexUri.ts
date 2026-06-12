// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
/**
 * Extract the Yandex Music track id from any of the URI/file forms it can take:
 * the `yandex:<id>` metadata uri used in source lists, the cached RAM path
 * `/dev/shm/yandex_music/tracks/<id>.<ext>`, or a CDN stream URL. Returns null
 * when no id can be found (i.e. not a Yandex track).
 */
export function getYandexIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let match: RegExpMatchArray | null = url.match(/^yandex:(\d+)$/);
  if (match) return match[1];
  match = url.match(/\/tracks\/(\d+)\.\w+/);
  if (match) return match[1];
  match = url.match(/[?&]track-id=([^&]+)/);
  if (match) return match[1];
  match = url.match(/[?&]id=([^&]+)/);
  if (match) return match[1];
  match = url.match(/\/track\/(\d+)/);
  if (match) return match[1];
  return null;
}
