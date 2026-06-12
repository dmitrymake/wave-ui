// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi } from "vitest";

vi.mock("../constants", () => ({
  API_ENDPOINTS: {
    RADIO_LOGOS: (filename: string) => `/imagesw/radio-logos/thumbs/${encodeURIComponent(filename)}`,
    COVER_ART: (path: string) => `/coverart.php/${encodeURI(path)}`,
  },
}));

import { getStationImageUrl, generateUid } from "../utils.js";
import { getYandexIdFromUrl } from "../sources/yandexUri.js";

describe("getStationImageUrl", () => {
  it("returns null for null/undefined station", () => {
    expect(getStationImageUrl(null as any)).toBeNull();
    expect(getStationImageUrl(undefined as any)).toBeNull();
  });

  it("returns null if station has no image", () => {
    expect(getStationImageUrl({ name: "Test" } as any)).toBeNull();
  });

  it("returns http URL directly", () => {
    const station = { name: "Radio", image: "http://example.com/logo.png" };
    expect(getStationImageUrl(station)).toBe("http://example.com/logo.png");
  });

  it("builds URL for local image", () => {
    const station = { name: "Jazz FM", image: "local" };
    const url = getStationImageUrl(station);
    expect(url).toBe("/imagesw/radio-logos/thumbs/Jazz%20FM.jpg");
  });

  it("builds URL for custom image filename", () => {
    const station = { name: "Radio", image: "custom_logo.png" };
    const url = getStationImageUrl(station);
    expect(url).toBe("/imagesw/radio-logos/thumbs/custom_logo.png");
  });
});

describe("getYandexIdFromUrl", () => {
  it("returns null for empty input", () => {
    expect(getYandexIdFromUrl(null)).toBeNull();
    expect(getYandexIdFromUrl(undefined)).toBeNull();
    expect(getYandexIdFromUrl("")).toBeNull();
  });

  it("extracts id from yandex:<id> metadata uri", () => {
    expect(getYandexIdFromUrl("yandex:12345")).toBe("12345");
  });

  it("extracts id from cached RAM path", () => {
    expect(getYandexIdFromUrl("/dev/shm/yandex_music/tracks/12345.mp3")).toBe("12345");
    expect(getYandexIdFromUrl("file:///dev/shm/yandex_music/tracks/678.flac")).toBe("678");
  });

  it("extracts id from CDN stream url query/path forms", () => {
    expect(getYandexIdFromUrl("https://cdn.yandex.net/get-mp3/x?track-id=999&foo=1")).toBe("999");
    expect(getYandexIdFromUrl("https://storage.yandex.net/track/4242/download")).toBe("4242");
  });

  it("returns null for a non-Yandex local file", () => {
    expect(getYandexIdFromUrl("Music/Artist/Album/track.flac")).toBeNull();
  });

  it("ignores a bare ?id= on a non-Yandex url but trusts it on a Yandex host", () => {
    // The over-broad matcher used to return an id for ANY url carrying ?id=, then
    // used it as a streamCache key and mis-enriched non-Yandex tracks.
    expect(getYandexIdFromUrl("http://radio.example.com/stream?id=abc&x=1")).toBeNull();
    expect(getYandexIdFromUrl("https://s12.storage.yandex.net/get-mp3/a?id=7777")).toBe("7777");
  });

  it("matches the same id across the source uri and the playing file", () => {
    const sourceId = getYandexIdFromUrl("yandex:55"); // list item
    const playingId = getYandexIdFromUrl("/dev/shm/yandex_music/tracks/55.mp3"); // currentSong.file
    expect(sourceId).toBe(playingId);
    expect(sourceId).toBe("55");
  });
});

describe("generateUid", () => {
  it("returns a non-empty string", () => {
    const uid = generateUid();
    expect(typeof uid).toBe("string");
    expect(uid.length).toBeGreaterThan(0);
  });

  it("generates unique values", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateUid());
    }
    expect(ids.size).toBe(100);
  });
});
