// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Device-flow regression: side-menu tab clicks (hash-driven) and local album
// drill (navigateTo) with real stores + real Router, wired like App.svelte.
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
import { activeMenuTab } from "../stores/ui.js";
import { Router } from "../router.js";

function top() {
  const s = get(navigationStack);
  return s[s.length - 1];
}

beforeEach(() => {
  resetNavigation();
  get(activeMenuTab);
  window.location.hash = "";
  setNavigationCallback((view, data) => Router.updateUrl(view, data));
});

describe("device flows: menu tabs and album drill", () => {
  it("side-menu tab click switches the tab via hash", () => {
    // Exactly what SideMenu.switchTab does on a fresh tab click.
    window.location.hash = "/albums";
    Router.handleHashChange();
    expect(get(activeMenuTab)).toBe("albums");
    expect(get(navigationStack)).toEqual([{ view: "root" }]);
  });

  it("all core tabs switch via hash", () => {
    for (const [hash, tab] of [
      ["#/artists", "artists"],
      ["#/albums", "albums"],
      ["#/queue", "queue"],
      ["#/radio", "radio"],
      ["#/playlists", "playlists"],
      ["#/settings", "settings"],
    ] as const) {
      window.location.hash = hash;
      Router.handleHashChange();
      expect(get(activeMenuTab)).toBe(tab);
    }
  });

  it("album drill: artists root -> artist -> album -> back", () => {
    window.location.hash = "/artists";
    Router.handleHashChange();

    // Click an artist row (LibraryView handleItemClick, root + artists tab).
    navigateTo("albums_by_artist", {
      name: "Artist",
      displayName: "Artist",
      thumbFile: null,
      year: "",
      _uid: "x",
    });
    Router.handleHashChange();
    expect(top().view).toBe("albums_by_artist");

    // Click an album row.
    navigateTo("tracks_by_album", {
      name: "Album",
      artist: "Artist",
      displayName: "Album",
      thumbFile: null,
      year: "",
      _uid: "y",
    });
    Router.handleHashChange();
    expect(top()).toEqual(
      expect.objectContaining({ view: "tracks_by_album" }),
    );

    // Back returns to the artist.
    navigateBack();
    Router.syncTopToUrl();
    expect(top().view).toBe("albums_by_artist");
  });
});
