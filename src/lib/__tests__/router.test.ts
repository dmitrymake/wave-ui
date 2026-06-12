// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import type { NavigationEntry } from "../types";

// Real writable stores back the router so we can assert on the navigation stack
// and active tab after a hash change. consumeRouteData is controllable per test:
// by default it returns null, forcing the router's own URL-parsing fallback (the
// path we actually want to cover) rather than data stashed by an earlier navigateTo.
// Hoisted so the same instances are shared by the mock factory and the assertions.
const h = vi.hoisted(() => {
  const w = <T>(v: T) => writableImpl(v);
  // writable isn't importable inside hoisted, so build a tiny equivalent.
  function writableImpl<T>(initial: T) {
    let value = initial;
    const subs = new Set<(v: T) => void>();
    return {
      set(v: T) {
        value = v;
        subs.forEach((fn) => fn(v));
      },
      update(fn: (v: T) => T) {
        this.set(fn(value));
      },
      subscribe(fn: (v: T) => void) {
        subs.add(fn);
        fn(value);
        return () => subs.delete(fn);
      },
    };
  }
  const state = { routeData: null as Record<string, unknown> | null };
  return {
    activeMenuTab: w<string>("library"),
    navigationStack: w<NavigationEntry[]>([{ view: "root" }]),
    searchQuery: w<string>(""),
    // The source registry (loaded transitively when the router resolves a
    // route prefix) imports yandexSource, whose daemon banner evaluates
    // `derived(yandexState, ...)` at module-eval. Provide a live store so that
    // module-eval succeeds exactly as it does in production. The router itself
    // never reads this — it's only here to satisfy the source import.
    yandexState: w<{ active: boolean; context_name: string | null }>({
      active: false,
      context_name: null,
    }),
    // YandexContext is being slimmed to just streamCache (the only field read in
    // production); the other former fields were never read here. Mirror the slim
    // shape so this mock keeps compiling against the new YandexContext type.
    yandexContext: w<{ streamCache: Record<string, unknown> }>({ streamCache: {} }),
    yandexFavorites: w<Set<string>>(new Set()),
    state,
    consumeRouteData: vi.fn(() => {
      const d = state.routeData;
      state.routeData = null;
      return d;
    }),
  };
});

const { activeMenuTab, navigationStack, searchQuery, consumeRouteData } = h;

vi.mock("../store", () => ({
  activeMenuTab: h.activeMenuTab,
  navigationStack: h.navigationStack,
  searchQuery: h.searchQuery,
  consumeRouteData: h.consumeRouteData,
  resetNavigation: () => h.navigationStack.set([{ view: "root" }]),
  setNavigationStack: (entries: NavigationEntry[]) => h.navigationStack.set(entries),
  pushNavigationEntry: (view: string, data: Record<string, unknown> | null = null) =>
    h.navigationStack.update((s) => [...s, { view, data }]),
}));

// Yandex stores moved to their own domain module; yandexSource (loaded
// transitively) reads yandexState/yandexContext/yandexFavorites from here, no
// longer from the shared "../store" barrel. Stub them to keep module-eval
// isolated from the real stores.
vi.mock("../stores/yandex", () => ({
  yandexState: h.yandexState,
  yandexContext: h.yandexContext,
  yandexFavorites: h.yandexFavorites,
}));

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Router } from "../router.js";

function reset() {
  activeMenuTab.set("library");
  navigationStack.set([{ view: "root" }]);
  searchQuery.set("");
  h.state.routeData = null;
  consumeRouteData.mockClear();
  window.location.hash = "";
}

// Drive the router from a hash, exactly as a real hashchange would.
function navigateHash(hash: string) {
  window.location.hash = hash;
  Router.handleHashChange();
}

function top(): NavigationEntry {
  const s = get(navigationStack);
  return s[s.length - 1];
}

beforeEach(reset);

describe("handleHashChange — root tabs", () => {
  it("routes #/artists to the artists root tab with a reset stack", () => {
    navigationStack.set([{ view: "root" }, { view: "albums_by_artist", data: { name: "X" } }]);
    navigateHash("#/artists");
    expect(get(activeMenuTab)).toBe("artists");
    expect(get(navigationStack)).toEqual([{ view: "root" }]);
  });

  it("routes #/albums, #/queue, #/radio, #/settings, #/playlists to their tabs", () => {
    for (const [hash, tab] of [
      ["#/albums", "albums"],
      ["#/queue", "queue"],
      ["#/radio", "radio"],
      ["#/settings", "settings"],
      ["#/playlists", "playlists"],
    ] as const) {
      reset();
      navigateHash(hash);
      expect(get(activeMenuTab)).toBe(tab);
      expect(get(navigationStack)).toEqual([{ view: "root" }]);
    }
  });
});

describe("handleHashChange — parametrised library routes parse into the stack", () => {
  it("#/artist/<name> -> albums_by_artist with name", () => {
    navigateHash("#/artist/Radiohead");
    expect(get(activeMenuTab)).toBe("artists");
    expect(top()).toEqual({ view: "albums_by_artist", data: { name: "Radiohead" } });
  });

  it("#/album/<artist>/<name> -> tracks_by_album with artist+name", () => {
    navigateHash("#/album/Radiohead/OK%20Computer");
    expect(get(activeMenuTab)).toBe("albums");
    expect(top()).toEqual({
      view: "tracks_by_album",
      data: { artist: "Radiohead", name: "OK Computer" },
    });
  });

  it("#/album/<name> -> tracks_by_album with only name", () => {
    navigateHash("#/album/Kid%20A");
    expect(top()).toEqual({ view: "tracks_by_album", data: { name: "Kid A" } });
  });

  it("#/playlist/<name> -> details with name+displayName", () => {
    navigateHash("#/playlist/My%20Mix");
    expect(get(activeMenuTab)).toBe("playlists");
    expect(top()).toEqual({
      view: "details",
      data: { name: "My Mix", displayName: "My Mix" },
    });
  });

  it("#/favorites -> details with the Favorites pseudo-playlist", () => {
    navigateHash("#/favorites");
    expect(get(activeMenuTab)).toBe("favorites");
    expect(top()).toEqual({ view: "details", data: { name: "Favorites" } });
  });
});

describe("handleHashChange — search and yandex routes", () => {
  it("#/search/<q> activates search, sets the query and resets the stack", () => {
    navigationStack.set([{ view: "root" }, { view: "details", data: { name: "X" } }]);
    navigateHash("#/search/beatles");
    expect(get(activeMenuTab)).toBe("search");
    expect(get(searchQuery)).toBe("beatles");
    expect(get(navigationStack)).toEqual([{ view: "root" }]);
  });

  it("#/yandex_search/<q> activates the yandex tab and pushes yandex_search", () => {
    navigateHash("#/yandex_search/depeche%20mode");
    expect(get(activeMenuTab)).toBe("yandex");
    expect(top()).toEqual({ view: "yandex_search", data: { query: "depeche mode" } });
  });

  it("#/yandex_album/<id> -> yandex_album_details", () => {
    navigateHash("#/yandex_album/4242");
    expect(get(activeMenuTab)).toBe("yandex");
    expect(top()).toEqual({ view: "yandex_album_details", data: { id: "4242", title: "Album" } });
  });

  it("#/yandex_artist/<id> -> yandex_artist_details", () => {
    navigateHash("#/yandex_artist/77");
    expect(top()).toEqual({ view: "yandex_artist_details", data: { id: "77", title: "Artist" } });
  });

  it("#/yandex_playlist/<uid>/<kind> -> yandex_playlist", () => {
    navigateHash("#/yandex_playlist/u123/k9");
    expect(top()).toEqual({
      view: "yandex_playlist",
      data: { uid: "u123", kind: "k9", title: "Playlist" },
    });
  });

  it("malformed 2-part #/yandex_playlist/<uid> (no kind) is a safe no-op", () => {
    // yandexSource's parseParams requires uid+kind (>= 2 post-prefix parts); with
    // only the uid it returns null, so the router has no data to push and the
    // playlist route does not allow empty data. Re-audit flagged this gap as
    // intentional: it must not throw and must not push a broken view onto the
    // stack. Start from a known stack and assert it is left untouched.
    const before: NavigationEntry[] = [
      { view: "root" },
      { view: "yandex_search", data: { query: "depeche mode" } },
    ];
    navigationStack.set(before);
    expect(() => navigateHash("#/yandex_playlist/SOMEUID")).not.toThrow();
    // The tab still activates (the route prefix carries menuTab: "yandex")...
    expect(get(activeMenuTab)).toBe("yandex");
    // ...but no broken/garbage entry is pushed: the stack is exactly as it was.
    expect(get(navigationStack)).toEqual(before);
  });

  it("bare #/yandex resets the stack to root", () => {
    navigationStack.set([{ view: "root" }, { view: "yandex_album_details", data: { id: "1" } }]);
    navigateHash("#/yandex");
    expect(get(activeMenuTab)).toBe("yandex");
    expect(get(navigationStack)).toEqual([{ view: "root" }]);
  });
});

describe("handleHashChange — dedup guard", () => {
  it("does not push a duplicate entry for the same view+data", () => {
    navigateHash("#/artist/Radiohead");
    const lenAfterFirst = get(navigationStack).length;

    // Same route again (a re-fire of hashchange) must be a no-op on the stack.
    navigateHash("#/artist/Radiohead");
    expect(get(navigationStack).length).toBe(lenAfterFirst);
  });

  it("pushes a new entry when the data differs for the same view", () => {
    navigateHash("#/artist/Radiohead");
    const lenAfterFirst = get(navigationStack).length;

    navigateHash("#/artist/Portishead");
    expect(get(navigationStack).length).toBe(lenAfterFirst + 1);
    expect(top()).toEqual({ view: "albums_by_artist", data: { name: "Portishead" } });
  });

  it("survives a malformed percent-escape in the hash without throwing", () => {
    expect(() => navigateHash("#/artist/%E0%A4%A")).not.toThrow();
    // The undecodable segment is kept verbatim and still pushed.
    expect(top().view).toBe("albums_by_artist");
  });
});

describe("updateUrl — serialize", () => {
  it("serialises a tracks_by_album view with artist into #/album/<artist>/<name>", () => {
    window.location.hash = "";
    Router.updateUrl("tracks_by_album", { name: "OK Computer", artist: "Radiohead" });
    expect(window.location.hash).toBe("#/album/Radiohead/OK%20Computer");
  });

  it("serialises an albums_by_artist view into #/artist/<name>", () => {
    window.location.hash = "";
    Router.updateUrl("albums_by_artist", { name: "Radiohead" });
    expect(window.location.hash).toBe("#/artist/Radiohead");
  });

  it("serialises the Favorites details view into #/favorites", () => {
    window.location.hash = "";
    Router.updateUrl("details", { name: "Favorites" });
    expect(window.location.hash).toBe("#/favorites");
  });

  it("serialises a yandex_album_details view into #/yandex_album/<id>", () => {
    window.location.hash = "";
    Router.updateUrl("yandex_album_details", { id: "4242" });
    expect(window.location.hash).toBe("#/yandex_album/4242");
  });
});

describe("parse/serialize round-trips", () => {
  // For each (view,data) the serialiser produces a hash that the parser maps back
  // to the same view and equivalent data — proving the two stay in lock-step.
  const cases: Array<{ view: string; data: Record<string, unknown> }> = [
    { view: "albums_by_artist", data: { name: "Radiohead" } },
    { view: "tracks_by_album", data: { name: "Kid A", artist: "Radiohead" } },
    { view: "details", data: { name: "Favorites" } },
    { view: "yandex_album_details", data: { id: "4242" } },
    { view: "yandex_artist_details", data: { id: "77" } },
    { view: "yandex_playlist", data: { uid: "u1", kind: "k2" } },
    { view: "yandex_search", data: { query: "depeche mode" } },
  ];

  for (const { view, data } of cases) {
    it(`round-trips ${view}`, () => {
      reset();
      Router.updateUrl(view, data);
      const serialised = window.location.hash;
      expect(serialised).not.toBe("");

      // Re-parse the serialised hash. Start from an unrelated stack so the parse
      // actually pushes a fresh entry rather than dedup-skipping.
      navigationStack.set([{ view: "root" }]);
      Router.handleHashChange();

      const parsed = top();
      expect(parsed.view).toBe(view);
      const pd = parsed.data as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        expect(pd[key]).toBe(data[key]);
      }
    });
  }
});
