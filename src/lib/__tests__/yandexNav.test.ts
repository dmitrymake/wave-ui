// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";
import { artistTarget, albumTarget } from "../yandexNav.js";
import type { YandexArtist, YandexAlbum } from "../types/yandex.js";

describe("artistTarget", () => {
  it("resolves details for an artist with id", () => {
    const a = { id: "359560", title: "Калинов Мост" } as YandexArtist;
    expect(artistTarget(a)).toEqual({
      view: "yandex_artist_details",
      data: a as unknown as Record<string, unknown>,
    });
  });

  it("accepts numeric ids", () => {
    const a = { id: 359560, title: "X" } as unknown as YandexArtist;
    expect(artistTarget(a)?.view).toBe("yandex_artist_details");
  });

  it("falls back to title search for an id-less artist", () => {
    const a = { title: "Ghost" } as unknown as YandexArtist;
    expect(artistTarget(a)).toEqual({ view: "yandex_search", data: { query: "Ghost" } });
  });

  it("treats empty-string id as missing", () => {
    const a = { id: "", title: "Ghost" } as unknown as YandexArtist;
    expect(artistTarget(a)).toEqual({ view: "yandex_search", data: { query: "Ghost" } });
  });

  it("returns null when there is neither id nor title", () => {
    expect(artistTarget({} as unknown as YandexArtist)).toBeNull();
    expect(artistTarget(null)).toBeNull();
    expect(artistTarget(undefined)).toBeNull();
  });
});

describe("albumTarget", () => {
  it("resolves details for an album with id", () => {
    const a = { id: "10684303", title: "Трибьют" } as YandexAlbum;
    expect(albumTarget(a)).toEqual({
      view: "yandex_album_details",
      data: a as unknown as Record<string, unknown>,
    });
  });

  it("falls back to title search for an id-less album", () => {
    const a = { title: "Ghost Album" } as unknown as YandexAlbum;
    expect(albumTarget(a)).toEqual({ view: "yandex_search", data: { query: "Ghost Album" } });
  });

  it("returns null when there is neither id nor title", () => {
    expect(albumTarget({} as unknown as YandexAlbum)).toBeNull();
    expect(albumTarget(null)).toBeNull();
  });
});
