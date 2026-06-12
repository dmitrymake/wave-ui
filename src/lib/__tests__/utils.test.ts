// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";

import { generateUid, formatClock, formatTotalDuration } from "../utils.js";
import { getYandexIdFromUrl } from "../sources/yandexUri.js";

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

describe("formatClock (m:ss)", () => {
  it("renders 0:00 for null/undefined/NaN", () => {
    expect(formatClock(null)).toBe("0:00");
    expect(formatClock(undefined)).toBe("0:00");
    expect(formatClock(NaN)).toBe("0:00");
  });

  it("zero-pads the seconds field", () => {
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(65)).toBe("1:05");
  });

  it("floors fractional seconds", () => {
    expect(formatClock(125.9)).toBe("2:05");
  });

  it("does not introduce an hours field — minutes accumulate past 60", () => {
    // 1h 1m 1s renders as 61:01, matching the existing track-row format.
    expect(formatClock(3661)).toBe("61:01");
  });
});

describe("formatTotalDuration (collection runtime)", () => {
  it("returns empty string for zero or unknown totals", () => {
    expect(formatTotalDuration(0)).toBe("");
    expect(formatTotalDuration(-5)).toBe("");
    expect(formatTotalDuration(NaN)).toBe("");
  });

  it("renders only minutes under an hour", () => {
    expect(formatTotalDuration(125)).toBe("2 min");
  });

  it("renders hours and minutes past an hour", () => {
    // 1h 1m
    expect(formatTotalDuration(3660)).toBe("1 hr 1 min");
  });

  it("drops residual seconds (rounds toward the minute)", () => {
    expect(formatTotalDuration(7259)).toBe("2 hr 0 min");
  });
});
