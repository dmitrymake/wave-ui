// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  navigationStack,
  navigateTo,
  consumeRouteDataFor,
  assignHash,
  isOwnHashAssignment,
  resetNavigation,
  updateTopEntry,
  isSameNavEntry,
  navIdentityKey,
  pendingRouteDataCount,
} from "../stores/navigation.js";

beforeEach(() => {
  resetNavigation();
  window.location.hash = "";
});

describe("pending queue (no clobber on fast navigations)", () => {
  it("keeps both payloads from two fast navigateTo() calls", () => {
    navigateTo("yandex_search", { query: "first" });
    navigateTo("yandex_search", { query: "second" });
    expect(pendingRouteDataCount()).toBe(2);
    expect(consumeRouteDataFor("yandex_search", { query: "second" })).toEqual({ query: "second" });
    expect(pendingRouteDataCount()).toBe(0);
    expect(consumeRouteDataFor("yandex_search", { query: "second" })).toBeNull();
  });
});

describe("isSameNavEntry deep-equal dedup", () => {
  it("matches identical query payloads (old name/id/uid check missed these)", () => {
    expect(isSameNavEntry("yandex_search", { query: "x" }, "yandex_search", { query: "x" })).toBe(true);
  });
  it("differs on different query", () => {
    expect(isSameNavEntry("yandex_search", { query: "x" }, "yandex_search", { query: "y" })).toBe(false);
  });
  it("is key-order insensitive", () => {
    expect(
      isSameNavEntry("tracks_by_album", { name: "A", artist: "B" }, "tracks_by_album", {
        artist: "B",
        name: "A",
      }),
    ).toBe(true);
  });
  it("differs on view mismatch and null/non-null", () => {
    expect(isSameNavEntry("a", { name: "x" }, "b", { name: "x" })).toBe(false);
    expect(isSameNavEntry("a", null, "a", { name: "x" })).toBe(false);
    expect(isSameNavEntry("a", null, "a", null)).toBe(true);
  });
});

describe("updateTopEntry (immutable top merge)", () => {
  it("merges patch into top data with a new array reference", () => {
    navigateTo("yandex_artist_details", { id: "1", title: "Artist" });
    const before = get(navigationStack);
    expect(updateTopEntry({ title: "Detailed Artist" })).toBe(true);
    const after = get(navigationStack);
    expect(after).not.toBe(before);
    expect(after[after.length - 1].data).toEqual({ id: "1", title: "Detailed Artist" });
    // Original snapshot untouched (no in-place mutation).
    expect(before[before.length - 1].data).toEqual({ id: "1", title: "Artist" });
  });
});

describe("navIdentityKey", () => {
  it("keys details by id regardless of other fields (rich vs parsed)", () => {
    expect(navIdentityKey("yandex_artist_details", { id: "1", title: "Real" })).toBe(
      navIdentityKey("yandex_artist_details", { id: "1", title: "Artist" }),
    );
  });
  it("treats a header-merged top entry as the same view (no duplicate push)", () => {
    // After loadArtistData merges {name, cover, ...} into the top entry,
    // re-navigating to the same artist must dedup instead of pushing again.
    expect(
      navIdentityKey("yandex_artist_details", {
        id: "1",
        title: "Detailed",
        name: "Detailed",
        cover: "c",
        description: "d",
      }),
    ).toBe(navIdentityKey("yandex_artist_details", { id: "1", title: "Artist" }));
  });
  it("ignores non-identity fields within and across view/mode namespaces", () => {
    // The router matches on view names, YandexView on mode names — both must
    // agree, otherwise header merges retrigger loads in a loop.
    expect(navIdentityKey("artist_details", { id: "1", title: "Real" })).toBe(
      navIdentityKey("artist_details", { id: "1", title: "Artist" }),
    );
    expect(navIdentityKey("album_details", { id: "7" })).toBe(
      navIdentityKey("album_details", { id: "7", title: "Album" }),
    );
    expect(navIdentityKey("playlist", { uid: "u", kind: "k" })).toBe(
      navIdentityKey("playlist", { uid: "u", kind: "k", title: "P" }),
    );
    expect(navIdentityKey("search", { query: "x" })).toBe(
      navIdentityKey("search", { query: "x", extra: 1 }),
    );
  });
  it("separates different ids, queries and views", () => {
    expect(navIdentityKey("yandex_artist_details", { id: "1" })).not.toBe(
      navIdentityKey("yandex_artist_details", { id: "2" }),
    );
    expect(navIdentityKey("yandex_search", { query: "a" })).not.toBe(
      navIdentityKey("yandex_search", { query: "b" }),
    );
    expect(navIdentityKey("yandex_search", { query: "a" })).not.toBe(
      navIdentityKey("yandex_artist_details", { id: "a" }),
    );
  });
  it("falls back to the full payload when the identity is absent", () => {
    expect(navIdentityKey("yandex_artist_details", { title: "X" })).not.toBe(
      navIdentityKey("yandex_artist_details", { title: "Y" }),
    );
  });
});

describe("assignHash / isOwnHashAssignment (popstate vs hashchange)", () => {
  it("recognizes our own assignment so popstate can skip it", () => {
    assignHash("/albums");
    expect(window.location.hash).toBe("#/albums");
    expect(isOwnHashAssignment()).toBe(true);
  });

  it("reports a foreign hash as a genuine traversal", () => {
    assignHash("/albums");
    window.location.hash = "/artists";
    expect(isOwnHashAssignment()).toBe(false);
  });

  it("normalizes a missing leading #", () => {
    assignHash("albums");
    expect(window.location.hash).toBe("#albums");
    expect(isOwnHashAssignment()).toBe(true);
  });
});

describe("consumeRouteDataFor (identity-matched consume)", () => {
  it("skips stale search payloads for an artist route (the reported bug)", () => {
    // Search keystrokes use replaceState (no hashchange), so their payloads sit
    // in the queue when the artist hashchange arrives.
    navigateTo("yandex_search", { query: "к" });
    navigateTo("yandex_search", { query: "калинов" });
    navigateTo("yandex_artist_details", { id: "359560", title: "Калинов Мост" });

    const data = consumeRouteDataFor("yandex_artist_details", { id: "359560", title: "Artist" });
    expect(data).toEqual({ id: "359560", title: "Калинов Мост" });
    // Superseded entries are drained with the match.
    expect(pendingRouteDataCount()).toBe(0);
  });

  it("returns null and preserves the queue when nothing matches", () => {
    navigateTo("yandex_search", { query: "x" });
    const data = consumeRouteDataFor("yandex_artist_details", { id: "9", title: "Artist" });
    expect(data).toBeNull();
    expect(pendingRouteDataCount()).toBe(1);
  });

  it("prefers the newest entry with the same identity", () => {
    navigateTo("yandex_artist_details", { id: "1", title: "First" });
    navigateTo("yandex_artist_details", { id: "2", title: "Other" });
    navigateTo("yandex_artist_details", { id: "1", title: "Second" });
    const data = consumeRouteDataFor("yandex_artist_details", { id: "1", title: "Artist" });
    expect(data).toEqual({ id: "1", title: "Second" });
    expect(pendingRouteDataCount()).toBe(0);
  });

  it("bounds the queue so abandoned payloads cannot grow it", () => {
    for (let i = 0; i < 30; i++) navigateTo("yandex_search", { query: `q${i}` });
    expect(pendingRouteDataCount()).toBeLessThanOrEqual(20);
  });
});
