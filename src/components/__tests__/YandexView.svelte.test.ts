// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
//
// SAFETY-NET component test for YandexView, written BEFORE the view is decomposed.
// YandexView is a stateful mode-machine: `viewMode` is derived from the navigation
// stack (dashboard / search / artist_details / album_details / playlist), it owns
// the tracks/albums stores, drives a debounced + monotonic search, and falls back
// to a "Not Connected" screen when the Yandex token is unset. These tests assert
// the OBSERVABLE behaviour at each mode boundary so the upcoming decomposition can
// be verified to preserve it: which screen renders, that the child views mount,
// and that typing into search reaches YandexApi.search and surfaces its results.
//
// The setup mirrors the existing component tests (QueueView/FullPlayer/TrackRow):
// the store barrel, the yandex store domain, the YandexApi client and the
// playerActions gateway are all mocked at their resolved ids so the whole
// YandexView -> BaseList -> YandexDashboard/SearchResults/ContentHeader/TrackRow
// tree mounts without the real MPD / fetch / IndexedDB stack. IntersectionObserver
// is stubbed on globalThis (jsdom has none) so the pagination observer is inert,
// and the search debounce is driven with fake timers.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import { writable } from "svelte/store";
import type { NavigationEntry } from "../../lib/types/nav";

// --- IntersectionObserver stub ----------------------------------------------
// jsdom ships no IntersectionObserver; YandexView constructs one in onMount for
// infinite-scroll pagination. A no-op stub lets the component mount and keeps the
// observer inert (it never fires `loadMore`), which is exactly what these
// non-scroll tests want.
class IOStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
  constructor(_cb: unknown, _opts?: unknown) {}
}
globalThis.IntersectionObserver = IOStub as unknown as typeof IntersectionObserver;

// --- Navigation stack: a controllable writable -------------------------------
// In the real app `navigationStack` is a READONLY store mutated only via the
// sanctioned primitives (navigateTo/setNavigationStack/resetNavigation). YandexView
// derives `viewMode` from the stack's top entry, so to put the view into a given
// mode the test drives this writable directly, and the mocked primitives mutate the
// same instance. Hoisted so the mock factory and the test body share one store.
const { navStack } = vi.hoisted(() => {
  const { writable: w } = require("svelte/store") as typeof import("svelte/store");
  return { navStack: w<NavigationEntry[]>([{ view: "root" }]) };
});

// --- Store barrel mock -------------------------------------------------------
// YandexView reads navigationStack/navigateTo/setNavigationStack + showToast from
// the barrel; its BaseList child reads navigationStack/activeMenuTab + scroll
// helpers; the TrackRow subtree (rendered per result row) reads
// currentSong/stations/favorites/artwork/context helpers. Provide all of them as
// controllable writables / spies. navigateTo and setNavigationStack mutate the
// shared navStack so a programmatic navigation actually changes `viewMode`.
vi.mock("../../lib/store", () => ({
  // navigation domain
  navigationStack: { subscribe: navStack.subscribe },
  navigateTo: vi.fn((view: string, data: Record<string, unknown> | null = null) => {
    navStack.update((s) => [...s, { view, data }]);
  }),
  // YandexView's loaders mutate the active stack entry's `.data` in place and then
  // call setNavigationStack(sameArray) to publish the merged header data. Clone into
  // a fresh array of fresh entries so the readonly-store consumer (the `currentView`
  // $derived) observes a new top-entry reference and re-renders with the merged
  // header — otherwise an identical reference can be memoized away in jsdom.
  setNavigationStack: vi.fn((entries: NavigationEntry[]) =>
    navStack.set(entries.map((e) => ({ ...e, data: e.data ? { ...e.data } : e.data }))),
  ),
  resetNavigation: vi.fn(() => navStack.set([{ view: "root" }])),
  saveScrollPosition: vi.fn(),
  getScrollPosition: () => 0,
  // ui domain
  showToast: vi.fn(),
  showModal: vi.fn(),
  activeMenuTab: writable("yandex"),
  openContextMenu: vi.fn(),
  // player / library / artwork (TrackRow subtree)
  currentSong: writable<{ file: string }>({ file: "" }),
  stations: writable([]),
  favorites: writable<Set<string>>(new Set()),
  getTrackThumbUrl: () => "/images/default_icon.png",
  getTrackCoverUrl: () => "/images/default_cover.png",
}));

// --- Yandex store domain mock ------------------------------------------------
// YandexView reads yandexAuthStatus/yandexFavorites/yandexSearchTrigger; the
// yandexSource module (pulled in transitively for yandexTrackToTrack + the sources
// registry that TrackRow consults) reads yandexContext/yandexState at load. All are
// controllable writables. yandexAuthStatus is the toggle between the connect screen
// and the live views.
const { yandexAuthStatus, yandexFavorites, yandexSearchTrigger } = vi.hoisted(() => {
  const { writable: w } = require("svelte/store") as typeof import("svelte/store");
  return {
    yandexAuthStatus: w<boolean>(false),
    yandexFavorites: w<Set<string>>(new Set()),
    yandexSearchTrigger: w<string | null>(null),
  };
});
vi.mock("../../lib/stores/yandex", () => ({
  yandexAuthStatus,
  yandexFavorites,
  yandexSearchTrigger,
  yandexContext: writable({ streamCache: {} }),
  yandexState: writable({ active: false, context_name: "Yandex Music" }),
}));

// --- YandexApi client mock ---------------------------------------------------
// Every network call YandexView makes is mocked here with canned responses, so the
// view's data-loading effects resolve deterministically and the matching child view
// renders. The dashboard, search, artist/album/playlist endpoints all return small
// fixed fixtures; mutation endpoints are no-op ok-acks. Re-export the real auth-error
// helpers (pure) so reportError's branch logic is unchanged. The spies are hoisted
// so the test body can assert call args (e.g. that search was reached).
const { ydxSearch, ydxGetPlaylistTracks, ydxGetArtist, ydxGetAlbum } = vi.hoisted(() => ({
  ydxSearch: vi.fn(),
  ydxGetPlaylistTracks: vi.fn(),
  ydxGetArtist: vi.fn(),
  ydxGetAlbum: vi.fn(),
}));
vi.mock("../../lib/yandex", () => {
  class YandexApiError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message || `Yandex API error (${status})`);
      this.name = "YandexApiError";
      this.status = status;
    }
  }
  return {
    YandexApiError,
    isYandexAuthError: (e: unknown) =>
      e instanceof YandexApiError && (e.status === 401 || e.status === 403),
    YANDEX_ENDPOINT: { URL: "/wave-yandex-api.php" },
    YandexApi: {
      // Dashboard endpoints
      getUserPlaylists: vi.fn(async () => [
        { uid: "u1", kind: "favorites", title: "My Favorites", trackCount: 12 },
        { uid: "u1", kind: "1001", title: "Road Trip", trackCount: 30, cover: "" },
      ]),
      getLanding: vi.fn(async () => ({ personal: [] })),
      getStationsDashboard: vi.fn(async () => ({
        stations: [{ uid: "s1", kind: "station", id: "genre:rock", title: "Rock Station" }],
      })),
      getFavoritesIds: vi.fn(async () => ({ ids: [] })),
      // Search
      search: ydxSearch,
      // Content
      getPlaylistTracks: ydxGetPlaylistTracks,
      getArtistDetails: ydxGetArtist,
      getAlbumDetails: ydxGetAlbum,
      // Mutations (no-op acks)
      playTrack: vi.fn(async () => ({ status: "ok" })),
      playRadio: vi.fn(async () => ({ status: "ok" })),
      playStation: vi.fn(async () => ({ status: "ok" })),
      playPlaylist: vi.fn(async () => ({ status: "ok" })),
      addTracksToQueue: vi.fn(async () => ({ status: "ok" })),
      request: vi.fn(async () => ({ status: "ok" })),
    },
  };
});

// playerActions gateway — TrackRow's click handler references togglePlay.
vi.mock("../../lib/playerActions", () => ({ togglePlay: vi.fn() }));

import YandexView from "../views/YandexView.svelte";

// Canned fixtures for the search + content modes.
const SEARCH_RESULT = {
  tracks: [
    { id: "100", title: "Search Track One", artist: "Result Artist", isYandex: true as const },
    { id: "101", title: "Search Track Two", artist: "Result Artist", isYandex: true as const },
  ],
  albums: [{ id: "200", title: "Searched Album", artist: "Album Artist" }],
  artists: [{ id: "300", title: "Searched Artist" }],
};

const PLAYLIST_TRACKS = {
  tracks: [
    { id: "400", title: "Playlist Track A", artist: "PL Artist", isYandex: true as const },
    { id: "401", title: "Playlist Track B", artist: "PL Artist", isYandex: true as const },
  ],
};

const ARTIST_DETAILS = {
  artist: { name: "Detailed Artist", description: "The artist bio" },
  cover: "",
  tracks: [{ id: "500", title: "Artist Top Track", artist: "Detailed Artist", isYandex: true as const }],
  albums: [{ id: "600", title: "Artist Album", artist: "Detailed Artist", year: 2020 }],
};

const ALBUM_DETAILS = {
  title: "Detailed Album",
  artist: "Album Maker",
  cover: "",
  tracks: [{ id: "700", title: "Album Track One", artist: "Album Maker", isYandex: true as const }],
};

beforeEach(() => {
  vi.clearAllMocks();
  navStack.set([{ view: "root" }]);
  yandexAuthStatus.set(false);
  yandexFavorites.set(new Set());
  yandexSearchTrigger.set(null);
  ydxSearch.mockResolvedValue(SEARCH_RESULT);
  ydxGetPlaylistTracks.mockResolvedValue(PLAYLIST_TRACKS);
  ydxGetArtist.mockResolvedValue(ARTIST_DETAILS);
  ydxGetAlbum.mockResolvedValue(ALBUM_DETAILS);
});

// Flush the chain of microtasks the data-loading effects await (Promise.allSettled,
// store sets, the derived re-render). A few awaited ticks settle every observed path.
async function settle(times = 4) {
  for (let i = 0; i < times; i++) await tick();
  await Promise.resolve();
  for (let i = 0; i < times; i++) await tick();
}

describe("YandexView — NOT CONNECTED screen", () => {
  it("renders the connect/token prompt and NO dashboard or search content when the token is unset", async () => {
    yandexAuthStatus.set(false);
    const { getByText, queryByText, container } = render(YandexView);
    await settle();

    // Stable marker for the not-connected screen.
    expect(getByText("Yandex Music Not Connected")).toBeInTheDocument();
    expect(getByText(/connect your account/i)).toBeInTheDocument();

    // The live views are gated behind the token: no search box, no dashboard
    // section labels, no track list.
    expect(container.querySelector('input[type="search"]')).toBeNull();
    expect(queryByText("Vibes")).toBeNull();
    expect(queryByText("Collection & Mixes")).toBeNull();
    expect(container.querySelector(".base-list-scroll-container")).toBeNull();
  });
});

describe("YandexView — DASHBOARD mode", () => {
  it("renders YandexDashboard (vibe + collection cards) when connected at the yandex root", async () => {
    yandexAuthStatus.set(true);
    navStack.set([{ view: "root" }]); // getModeFromStack(root) => "dashboard"
    const { getByText, container } = render(YandexView);
    await settle();

    // The not-connected screen is gone.
    expect(container.querySelector(".token-alert")).toBeNull();

    // Dashboard section headers (stable markers owned by YandexDashboard).
    expect(getByText("Vibes")).toBeInTheDocument();
    expect(getByText("Collection & Mixes")).toBeInTheDocument();

    // Canned cards: "My Vibe" is always prepended; the mood station + user
    // playlists come from the mocked endpoints.
    expect(getByText("My Vibe")).toBeInTheDocument();
    expect(getByText("Rock Station")).toBeInTheDocument();
    expect(getByText("My Favorites")).toBeInTheDocument();
    expect(getByText("Road Trip")).toBeInTheDocument();

    // The search box is shown in dashboard mode too.
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
  });
});

describe("YandexView — SEARCH mode", () => {
  it("renders the search input and, after the debounce, reaches YandexApi.search and shows the results", async () => {
    vi.useFakeTimers();
    try {
      yandexAuthStatus.set(true);
      // Start in search mode with an empty query so the input renders without an
      // initial auto-search (handleViewChange only searches a non-empty term).
      navStack.set([{ view: "root" }, { view: "yandex_search", data: { query: "" } }]);
      const { container, getByText } = render(YandexView);
      // Drain the mount-time effects under fake timers.
      await vi.advanceTimersByTimeAsync(0);

      const input = container.querySelector<HTMLInputElement>('input[type="search"]');
      expect(input).not.toBeNull();

      // No search yet.
      expect(ydxSearch).not.toHaveBeenCalled();

      // Type a query (>= 2 chars) — handleSearchInput debounces for 600ms.
      await fireEvent.input(input!, { target: { value: "daft punk" } });
      // Before the debounce elapses, still no request.
      await vi.advanceTimersByTimeAsync(300);
      expect(ydxSearch).not.toHaveBeenCalled();

      // Advance past the debounce; the active stack entry is already in search mode
      // so performSearch() fires directly (no extra navigateTo round-trip needed).
      await vi.advanceTimersByTimeAsync(600);
      // Let the resolved search promise + reactive re-render settle.
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);

      expect(ydxSearch).toHaveBeenCalledWith("daft punk");

      // YandexSearchResults rendered the canned artist/album sections, and the track
      // rows came from the search tracks (set into tracksStore).
      expect(getByText("Artists")).toBeInTheDocument();
      expect(getByText("Searched Artist")).toBeInTheDocument();
      expect(getByText("Albums")).toBeInTheDocument();
      expect(getByText("Searched Album")).toBeInTheDocument();
      expect(getByText("Search Track One")).toBeInTheDocument();
      expect(getByText("Search Track Two")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("YandexView — CONTENT modes (artist / album / playlist)", () => {
  it("renders YandexContentHeader with the artist header and the artist's track list", async () => {
    yandexAuthStatus.set(true);
    navStack.set([
      { view: "root" },
      { view: "yandex_artist_details", data: { id: "300", title: "Artist" } },
    ]);
    const { getByText, container } = render(YandexView);
    await settle();

    expect(ydxGetArtist).toHaveBeenCalledWith("300");

    // Header label is derived from viewMode (artist_details -> "ARTIST"). The canned
    // header data lands as the title (scoped to .header-title — the artist name also
    // appears as each track's artist, so a global text query is ambiguous) + the bio.
    expect(getByText("ARTIST")).toBeInTheDocument();
    expect(container.querySelector(".header-title")?.textContent?.trim()).toBe("Detailed Artist");
    expect(container.querySelector(".header-sub-text")?.textContent?.trim()).toBe("The artist bio");

    // The artist's tracks render as rows, and the albums shelf renders too.
    expect(getByText("Artist Top Track")).toBeInTheDocument();
    expect(getByText("Artist Album")).toBeInTheDocument();
    // A track list container is present.
    expect(container.querySelector(".base-list-scroll-container")).not.toBeNull();
  });

  it("renders YandexContentHeader with the album header and the album's track list", async () => {
    yandexAuthStatus.set(true);
    navStack.set([
      { view: "root" },
      { view: "yandex_album_details", data: { id: "600", title: "Album" } },
    ]);
    const { getByText, container } = render(YandexView);
    await settle();

    expect(ydxGetAlbum).toHaveBeenCalledWith("600");

    // Scope the title/sub-text to the header element: the album artist ("Album Maker")
    // also appears on the track row, so a global text query is ambiguous.
    expect(getByText("ALBUM")).toBeInTheDocument();
    expect(container.querySelector(".header-title")?.textContent?.trim()).toBe("Detailed Album");
    expect(container.querySelector(".header-sub-text")?.textContent?.trim()).toBe("Album Maker");
    expect(getByText("Album Track One")).toBeInTheDocument();
  });

  it("renders a playlist's track list from getPlaylistTracks", async () => {
    yandexAuthStatus.set(true);
    navStack.set([
      { view: "root" },
      { view: "yandex_playlist", data: { uid: "u1", kind: "1001", title: "Road Trip" } },
    ]);
    const { getByText, container } = render(YandexView);
    await settle();

    expect(ydxGetPlaylistTracks).toHaveBeenCalledWith("u1", "1001", 0);

    // Playlist header title comes from the nav data; tracks come from the endpoint.
    expect(getByText("Road Trip")).toBeInTheDocument();
    expect(getByText("Playlist Track A")).toBeInTheDocument();
    expect(getByText("Playlist Track B")).toBeInTheDocument();
    expect(container.querySelector(".base-list-scroll-container")).not.toBeNull();
  });
});
