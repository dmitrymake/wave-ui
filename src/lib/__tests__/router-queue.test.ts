// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Integration: real navigation store + real Router, wired like App.svelte.
// Reproduces the reported device bug: typing in Yandex search (replaceState —
// no hashchange, payloads pile up in the queue) and then opening an artist
// pushed an artist_details entry with a STALE {query} payload ("missing
// artist id" dead end), because consume took the queue head blindly.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  navigationStack,
  navigateTo,
  navigateBack,
  resetNavigation,
  setNavigationCallback,
} from "../stores/navigation.js";
import { Router } from "../router.js";
import type { NavigationEntry } from "../types.js";

function stack(): NavigationEntry[] {
  return get(navigationStack);
}

function top(): NavigationEntry {
  const s = stack();
  return s[s.length - 1];
}

beforeEach(() => {
  resetNavigation();
  window.location.hash = "";
  // Same wiring as App.svelte onMount.
  setNavigationCallback((view, data) => Router.updateUrl(view, data));
});

describe("search staleness vs artist open (reported device bug)", () => {
  it("opens the clicked artist with its own data, not a stale search query", () => {
    // User types in Yandex search: replaceState updates the hash silently —
    // no hashchange fires, so both payloads stay queued.
    navigateTo("yandex_search", { query: "к" });
    navigateTo("yandex_search", { query: "калинов" });
    expect(window.location.hash).toBe("#/yandex_search/%D0%BA%D0%B0%D0%BB%D0%B8%D0%BD%D0%BE%D0%B2");

    // User clicks the artist card.
    navigateTo("yandex_artist_details", { id: "359560", title: "Калинов Мост" });
    expect(window.location.hash).toBe("#/yandex_artist/359560");

    // The browser delivers ONE hashchange for the artist hash.
    Router.handleHashChange();

    // No bogus second details entry with the stale {query} payload.
    expect(top()).toEqual({
      view: "yandex_artist_details",
      data: { id: "359560", title: "Калинов Мост" },
    });
    expect(stack().filter((e) => e.view === "yandex_artist_details")).toHaveLength(1);
  });

  it("a later hashchange for another artist still resolves correctly", () => {
    navigateTo("yandex_search", { query: "калинов" });
    navigateTo("yandex_artist_details", { id: "359560", title: "Калинов Мост" });
    Router.handleHashChange();
    expect(top()).toEqual({
      view: "yandex_artist_details",
      data: { id: "359560", title: "Калинов Мост" },
    });

    navigateTo("yandex_artist_details", { id: "2628730", title: "Дмитрий Ревякин" });
    Router.handleHashChange();
    expect(top()).toEqual({
      view: "yandex_artist_details",
      data: { id: "2628730", title: "Дмитрий Ревякин" },
    });
  });

  it("deep link with an empty queue falls back to parsed data", () => {
    window.location.hash = "#/yandex_artist/77";
    Router.handleHashChange();
    expect(top()).toEqual({ view: "yandex_artist_details", data: { id: "77", title: "Artist" } });
  });

  it("Back re-points the hash at the new top without adding history", () => {
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    try {
      navigateTo("albums_by_artist", { name: "A" });
      Router.handleHashChange();
      navigateTo("tracks_by_album", { name: "T", artist: "A" });
      Router.handleHashChange();
      expect(window.location.hash).toBe(`#/${"album"}/${encodeURIComponent("A")}/${encodeURIComponent("T")}`);

      replaceSpy.mockClear();
      navigateBack();
      Router.syncTopToUrl();
      expect(window.location.hash).toBe(`#/${"artist"}/${encodeURIComponent("A")}`);
      expect(replaceSpy).toHaveBeenCalledTimes(1);
    } finally {
      replaceSpy.mockRestore();
    }

    // A refresh-equivalent on that hash must not duplicate or move the stack.
    const len = stack().length;
    Router.handleHashChange();
    expect(stack()).toHaveLength(len);
    expect(top()).toEqual({ view: "albums_by_artist", data: { name: "A" } });
  });

  it("re-clicking the same artist does not push a duplicate entry", () => {
    navigateTo("yandex_artist_details", { id: "359560", title: "Калинов Мост" });
    Router.handleHashChange();
    const len = stack().length;
    // Same content, header-merged shape (as after loadArtistData).
    navigateTo("yandex_artist_details", {
      id: "359560",
      title: "Калинов Мост",
      name: "Калинов Мост",
      cover: "c",
    });
    expect(stack()).toHaveLength(len);
  });
});
