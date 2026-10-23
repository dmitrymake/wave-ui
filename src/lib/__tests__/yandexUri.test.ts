// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { describe, expect, it } from "vitest";
import { getYandexIdFromUrl } from "../sources/yandexUri";

describe("getYandexIdFromUrl", () => {
  it.each([
    "yandex:123",
    "/dev/shm/yandex_music/tracks/123.mp3",
    "file:///dev/shm/yandex_music/tracks/123.mp3",
    "http://127.0.0.1:8767/yandex/stream/123",
    "http://127.0.0.1:8767/yandex/stream/123?cache=1",
  ])("extracts the id from %s", (uri) => {
    expect(getYandexIdFromUrl(uri)).toBe("123");
  });

  it.each([
    "http://unrelated.example/yandex/stream/123",
    "http://127.0.0.1:8766/yandex/stream/123",
    "http://127.0.0.1:8767/yandex/stream/123abc",
    "http://radio.example/live?id=123",
    "Music/Album/01.flac",
    null,
  ])("does not misidentify %s", (uri) => {
    expect(getYandexIdFromUrl(uri)).toBeNull();
  });
});
