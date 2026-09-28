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
vi.mock("../../lib/store", async (importOriginal) => {
  // Real identity helper (pure): the component's change detection must use the
  // exact production key semantics — a local copy drifted once already and
  // reintroduced the header-merge reload loop in tests.
  const { navIdentityKey } = await importOriginal<typeof import("../../lib/store")>();
  return {
    // navigation domain
    navigationStack: { subscribe: navStack.subscribe },
    navIdentityKey,
    navigateTo: vi.fn((view: string, data: Record<string, unknown> | null = null) => {
      navStack.update((s) => [...s, { view, data }]);
    }),
    navigateBack: vi.fn(() => {
      navStack.update((s) => (s.length > 1 ? s.slice(0, -1) : s));
    }),
    updateTopEntry: vi.fn((patch: Record<string, unknown>) => {
      navStack.update((s) => {
        if (!s.length) return s;
        const top = s[s.length - 1];
        const next = [...s];
        next[next.length - 1] = { ...top, data: { ...(top.data ?? {}), ...patch } };
        return next;
      });
      return true;
    }),
    // Clone into a fresh array so the readonly-store consumer observes a new
    // top-entry reference and re-renders (an identical reference can be
    // memoized away in jsdom).
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
  };
});

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
import { showToast } from "../../lib/store";

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

  it("falls back to a title search when opening an artist without id", async () => {
    // Rare API rows lack an id: opening them must not navigate into a details
    // view that fetches `.../undefined` ("missing artist id"). Instead the
    // view falls back to searching by title.
    vi.useFakeTimers();
    try {
      yandexAuthStatus.set(true);
      ydxSearch.mockResolvedValue({
        tracks: [],
        albums: [],
        artists: [{ title: "Ghost Artist" }],
      });
      navStack.set([{ view: "root" }, { view: "yandex_search", data: { query: "" } }]);
      const { container, getByText } = render(YandexView);
      await vi.advanceTimersByTimeAsync(0);

      const input = container.querySelector<HTMLInputElement>('input[type="search"]');
      expect(input).not.toBeNull();
      await fireEvent.input(input!, { target: { value: "ghost" } });
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);

      expect(getByText("Ghost Artist")).toBeInTheDocument();

      // Click the id-less artist card: no details fetch, search fallback instead.
      await fireEvent.click(getByText("Ghost Artist"));
      await vi.advanceTimersByTimeAsync(0);

      expect(ydxGetArtist).not.toHaveBeenCalled();
      let top: NavigationEntry | undefined;
      navStack.subscribe((s: NavigationEntry[]) => {
        top = s[s.length - 1];
      })();
      expect(top).toEqual({ view: "yandex_search", data: { query: "Ghost Artist" } });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("YandexView — search debounce vs navigation", () => {
  const getNavStack = (): NavigationEntry[] => {
    let snapshot: NavigationEntry[] = [];
    navStack.subscribe((s: NavigationEntry[]) => {
      snapshot = s;
    })();
    return snapshot;
  };

  it("abandons a pending search when the user leaves for a detail view", async () => {
    // Typed in search, opened an artist before the 600ms debounce fired: the
    // stale timer must not yank the user back to search (clobbering the view).
    vi.useFakeTimers();
    try {
      yandexAuthStatus.set(true);
      const artist = { view: "yandex_artist_details", data: { id: "300", title: "Artist" } };
      navStack.set([{ view: "root" }, { view: "yandex_search", data: { query: "" } }]);
      const { container } = render(YandexView);
      await vi.advanceTimersByTimeAsync(0);

      const input = container.querySelector<HTMLInputElement>('input[type="search"]');
      expect(input).not.toBeNull();
      await fireEvent.input(input!, { target: { value: "ab" } });

      // Leave for the artist before the debounce elapses.
      navStack.set([{ view: "root" }, artist]);
      await vi.advanceTimersByTimeAsync(700);
      await vi.advanceTimersByTimeAsync(0);

      const stack = getNavStack();
      expect(stack).toHaveLength(2);
      // Still on the artist view (the loader may have merged its header data —
      // that is fine); the point is no extra search entry was pushed.
      expect(stack[1].view).toBe("yandex_artist_details");
      expect((stack[1].data as Record<string, unknown>)?.id).toBe("300");
      expect(ydxSearch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("navigates to search when typing in dashboard mode", async () => {
    // The bar also lives on the dashboard: typing there must still transition
    // into search mode after the debounce.
    vi.useFakeTimers();
    try {
      yandexAuthStatus.set(true);
      navStack.set([{ view: "root" }]);
      const { container } = render(YandexView);
      await vi.advanceTimersByTimeAsync(0);

      const input = container.querySelector<HTMLInputElement>('input[type="search"]');
      expect(input).not.toBeNull();
      await fireEvent.input(input!, { target: { value: "xyz" } });
      await vi.advanceTimersByTimeAsync(700);
      await vi.advanceTimersByTimeAsync(0);

      const stack = getNavStack();
      expect(stack[stack.length - 1]).toEqual({ view: "yandex_search", data: { query: "xyz" } });
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

  it("retries instead of showing a poisoned empty cache after leaving mid-load", async () => {
    // Regression: open A (slow) -> back before it resolves -> the pre-switch
    // save used to cache the just-cleared (empty) stores under A's key, so
    // reopening A restored [] forever and never retried the load.
    yandexAuthStatus.set(true);
    const resolvers: Record<string, (v: unknown) => void> = {};
    let calls = 0;
    ydxGetArtist.mockImplementation((id: string) => {
      calls++;
      return new Promise((r) => (resolvers[`${id}#${calls}`] = r));
    });
    const artistA = { view: "root" };
    navStack.set([artistA, { view: "yandex_artist_details", data: { id: "A1", title: "Artist A" } }]);
    const { getByText, queryByText } = render(YandexView);
    await settle();
    expect(ydxGetArtist).toHaveBeenCalledTimes(1);

    // Leave before A resolves, then let the late response drop.
    navStack.set([artistA]);
    await settle();
    resolvers["A1#1"]!({
      artist: { name: "Artist A" },
      cover: "",
      tracks: [{ id: "a1", title: "A Track", artist: "Artist A", isYandex: true as const }],
      albums: [],
    });
    await settle();

    // Reopen A: must retry the load, not restore the poisoned empty entry.
    navStack.set([artistA, { view: "yandex_artist_details", data: { id: "A1", title: "Artist A" } }]);
    await settle();
    expect(ydxGetArtist).toHaveBeenCalledTimes(2);
    expect(queryByText("A Track")).toBeNull();

    resolvers["A1#2"]!({
      artist: { name: "Artist A" },
      cover: "",
      tracks: [{ id: "a1", title: "A Track", artist: "Artist A", isYandex: true as const }],
      albums: [],
    });
    await settle();
    expect(getByText("A Track")).toBeInTheDocument();
  });

  it("restores a fully loaded view from cache when backing out of a slow load", async () => {
    // Good path that must keep working: A loaded -> open B (slow) -> back to A
    // before B resolves -> A shows instantly from its complete cache entry,
    // with no refetch, and B's late response is dropped.
    yandexAuthStatus.set(true);
    const resolvers: Record<string, (v: unknown) => void> = {};
    ydxGetArtist.mockImplementation(
      (id: string) =>
        new Promise((r) => {
          resolvers[id] = r;
        }),
    );
    const root = { view: "root" };
    const entryA = { view: "yandex_artist_details", data: { id: "A1", title: "Artist A" } };
    navStack.set([root, entryA]);
    const { getByText } = render(YandexView);
    await settle();
    resolvers["A1"]!({
      artist: { name: "Artist A" },
      cover: "",
      tracks: [{ id: "a1", title: "A Track", artist: "Artist A", isYandex: true as const }],
      albums: [],
    });
    await settle();
    expect(getByText("A Track")).toBeInTheDocument();
    expect(ydxGetArtist).toHaveBeenCalledTimes(1);

    // Open B, leave before it resolves, come back to A.
    navStack.set([root, entryA, { view: "yandex_artist_details", data: { id: "B1", title: "Artist B" } }]);
    await settle();
    expect(ydxGetArtist).toHaveBeenCalledTimes(2);
    navStack.set([root, entryA]);
    await settle();
    expect(getByText("A Track")).toBeInTheDocument();
    expect(ydxGetArtist).toHaveBeenCalledTimes(2);

    // B resolves late — must not paint over A.
    resolvers["B1"]!({
      artist: { name: "Artist B" },
      cover: "",
      tracks: [{ id: "b1", title: "B Track", artist: "Artist B", isYandex: true as const }],
      albums: [],
    });
    await settle();
    expect(getByText("A Track")).toBeInTheDocument();
  });
  it("treats a nameless contentless artist response as failure and retries on revisit", async () => {
    // Backend fluke (empty 200) used to blank the header AND poison the cache,
    // so every revisit restored the empty page forever.
    yandexAuthStatus.set(true);
    ydxGetArtist.mockResolvedValue({});
    const root = { view: "root" };
    const entry = { view: "yandex_artist_details", data: { id: "A1", title: "Artist A" } };
    navStack.set([root, entry]);
    render(YandexView);
    await settle();
    expect(ydxGetArtist).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showToast)).toHaveBeenCalledWith(expect.any(String), "error");

    // Nothing was cached: leaving and coming back refetches instead of
    // restoring [].
    navStack.set([root]);
    await settle();
    navStack.set([root, entry]);
    await settle();
    expect(ydxGetArtist).toHaveBeenCalledTimes(2);
  });

  it("does not fetch artist details when the nav entry has no id", async () => {
    // Id-less entries must not hit the API as `.../undefined`, and two
    // different id-less views must not collapse onto one view key (that
    // skipped the second navigation and left the previous content on screen).
    yandexAuthStatus.set(true);
    const root = { view: "root" };
    navStack.set([root, { view: "yandex_artist_details", data: { title: "Nameless" } }]);
    render(YandexView);
    await settle();
    expect(ydxGetArtist).not.toHaveBeenCalled();
    expect(vi.mocked(showToast)).toHaveBeenCalledTimes(1);

    navStack.set([root, { view: "yandex_artist_details", data: { title: "Other" } }]);
    await settle();
    expect(ydxGetArtist).not.toHaveBeenCalled();
    expect(vi.mocked(showToast)).toHaveBeenCalledTimes(2);
  });

  it("drops a stale artist response when navigating A -> B before A resolves", async () => {
    // Regression: opening artist B while artist A's request was still in flight
    // used to end with A's tracks rendered under B ("opened B, see A").
    yandexAuthStatus.set(true);
    let resolveA!: (v: unknown) => void;
    let resolveB!: (v: unknown) => void;
    ydxGetArtist.mockImplementation((id: string) => {
      if (id === "A1") return new Promise((r) => (resolveA = r));
      return new Promise((r) => (resolveB = r));
    });
    navStack.set([
      { view: "root" },
      { view: "yandex_artist_details", data: { id: "A1", title: "Artist A" } },
    ]);
    const { getByText, queryByText } = render(YandexView);
    await settle();
    expect(ydxGetArtist).toHaveBeenCalledWith("A1");

    // Navigate to B before A resolves.
    navStack.set([
      { view: "root" },
      { view: "yandex_artist_details", data: { id: "A1", title: "Artist A" } },
      { view: "yandex_artist_details", data: { id: "B1", title: "Artist B" } },
    ]);
    await settle();
    expect(ydxGetArtist).toHaveBeenCalledWith("B1");

    // B resolves first and renders.
    resolveB!({
      artist: { name: "Artist B" },
      cover: "",
      tracks: [{ id: "b1", title: "B Track", artist: "Artist B", isYandex: true as const }],
      albums: [],
    });
    await settle();
    expect(getByText("B Track")).toBeInTheDocument();

    // A resolves late — its result must be dropped, not painted over B.
    resolveA!({
      artist: { name: "Artist A" },
      cover: "",
      tracks: [{ id: "a1", title: "A Track", artist: "Artist A", isYandex: true as const }],
      albums: [],
    });
    await settle();
    expect(getByText("B Track")).toBeInTheDocument();
    expect(queryByText("A Track")).toBeNull();
  });
});
