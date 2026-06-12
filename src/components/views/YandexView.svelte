<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { writable, get } from "svelte/store";
  import { YandexApi, isYandexAuthError, type PlaylistSource } from "../../lib/yandex";
  import { ViewCache } from "../../lib/yandexViewCache";
  import {
    yandexAuthStatus,
    showToast,
    yandexFavorites,
    yandexSearchTrigger,
    navigationStack,
    navigateTo,
  } from "../../lib/store";
  import { MSG } from "../../lib/messages";
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import ImageLoader from "../ImageLoader.svelte";
  import Skeleton from "../Skeleton.svelte";
  import YandexDashboard from "./YandexDashboard.svelte";
  import YandexSearchResults from "./YandexSearchResults.svelte";
  import YandexContentHeader from "./YandexContentHeader.svelte";
  import type { Track, YandexTrack, YandexAlbum, YandexArtist, YandexPlaylist, YandexSearchResults as YandexSearchResultsType, NavigationEntry, YandexHeaderData } from "../../lib/types";

  const tracksStore = writable<YandexTrack[]>([]);
  const albumsStore = writable<YandexAlbum[]>([]);

  let vibeCards = $state<YandexPlaylist[]>([]);
  let collectionCards = $state<YandexPlaylist[]>([]);

  let isLoading = $state(false);
  let isLoadingMore = $state(false);

  let currentPlaylistContext = $state({
    uid: null as string | null,
    kind: null as string | null,
    offset: 0,
    type: "playlist",
  });
  let canLoadMore = $state(true);
  let loadMoreSentinel = $state<HTMLDivElement | null>(null);
  let observer: IntersectionObserver | undefined;

  let searchQuery = $state("");
  let searchResults = $state<YandexSearchResultsType>({ tracks: [], albums: [], artists: [] });
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  // Monotonic token: a slow search response is ignored if a newer search has
  // started, so out-of-order responses can't clobber fresher results.
  let searchSeq = 0;

  /** Surface a load/search failure as a toast, distinguishing expired tokens. */
  function reportError(label: string, e: unknown, fallbackMsg: string) {
    console.error(`[YandexView] ${label}:`, e);
    if (isYandexAuthError(e)) {
      // Flip auth state so the view falls back to the "Not Connected" screen
      // instead of looping failing requests with no recovery path.
      yandexAuthStatus.set(false);
      showToast(MSG.YANDEX_TOKEN_EXPIRED, "error");
    } else {
      showToast(fallbackMsg, "error");
    }
  }

  let currentView = $derived($navigationStack[$navigationStack.length - 1]);
  let viewMode = $derived(getModeFromStack(currentView));
  let isTokenSet = $derived($yandexAuthStatus);

  let uniqueViewKey = $state("");

  // --- Navigation Cache ---
  interface ViewCacheEntry {
    tracks: YandexTrack[];
    albums: YandexAlbum[];
    searchResults?: YandexSearchResultsType;
    headerData?: Record<string, unknown>;
    playlistContext?: typeof currentPlaylistContext;
    canLoadMore?: boolean;
  }
  const viewCache = new ViewCache<ViewCacheEntry>(20);
  const getCacheKey = (mode: string, data: Record<string, unknown> | null) =>
    viewCache.key(mode, data);
  const saveToCache = (key: string, entry: ViewCacheEntry) =>
    viewCache.set(key, entry);

  function restoreFromCache(key: string): boolean {
    const cached = viewCache.get(key);
    if (!cached) return false;
    tracksStore.set(cached.tracks);
    albumsStore.set(cached.albums);
    if (cached.searchResults) searchResults = cached.searchResults;
    if (cached.playlistContext) {
      currentPlaylistContext = cached.playlistContext;
      canLoadMore = cached.canLoadMore ?? false;
    }
    if (cached.headerData) {
      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active) {
        active.data = { ...active.data, ...cached.headerData };
        navigationStack.set(stack);
      }
    }
    return true;
  }

  $effect(() => {
    const mode = getModeFromStack(currentView);
    const newKey = mode + JSON.stringify(currentView?.data || {});

    if (newKey !== uniqueViewKey) {
      uniqueViewKey = newKey;
      handleViewChange(mode, currentView?.data ?? null);
    }
  });

  $effect(() => {
    if ($yandexSearchTrigger) {
      const term = $yandexSearchTrigger;
      yandexSearchTrigger.set(null);
      navigateTo("yandex_search", { query: term });
    }
  });

  function getModeFromStack(view: NavigationEntry | undefined) {
    if (!view || view.view === "root") return "dashboard";
    if (view.view.startsWith("yandex_"))
      return view.view.replace("yandex_", "");
    return "dashboard";
  }

  async function handleViewChange(mode: string, data: Record<string, unknown> | null) {
    // Save current view to cache before switching
    const prevKey = untrack(() => {
      const prevMode = viewMode;
      if (prevMode && prevMode !== mode && prevMode !== "dashboard") {
        return getCacheKey(prevMode, $navigationStack[$navigationStack.length - 2]?.data ?? null);
      }
      return null;
    });

    if (prevKey && prevKey !== getCacheKey(mode, data)) {
      saveToCache(prevKey, {
        tracks: get(tracksStore),
        albums: get(albumsStore),
        searchResults: searchResults.tracks.length > 0 ? { ...searchResults } : undefined,
        playlistContext: { ...currentPlaylistContext },
        canLoadMore,
      });
    }

    // Try restore from cache
    const cacheKey = getCacheKey(mode, data);

    if (mode !== "dashboard") {
      if (mode !== "search") tracksStore.set([]);
      albumsStore.set([]);
    }

    if (mode === "dashboard") {
      searchQuery = "";
      if (vibeCards.length === 0) await loadDashboard();
    } else if (mode === "search") {
      const term = (data?.query as string) || "";
      searchQuery = term;
      if (term) {
        if (!restoreFromCache(cacheKey)) {
          await performSearch();
        }
      }
    } else if (mode === "playlist") {
      if (!restoreFromCache(cacheKey)) {
        await loadPlaylistData(data ?? {});
      }
    } else if (mode === "artist_details") {
      if (!restoreFromCache(cacheKey)) {
        await loadArtistData(data ?? {});
      }
    } else if (mode === "album_details") {
      if (!restoreFromCache(cacheKey)) {
        await loadAlbumData(data ?? {});
      }
    }
  }

  onMount(() => {
    if (isTokenSet && vibeCards.length === 0) {
      loadDashboard();
      syncLikes();
    }
    setupObserver();
  });

  onDestroy(() => {
    clearTimeout(searchDebounceTimer);
    observer?.disconnect();
  });

  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !isLoading &&
          !isLoadingMore &&
          canLoadMore
        ) {
          if (
            ["playlist", "album_details", "artist_details"].includes(viewMode)
          ) {
            loadMore();
          }
        }
      },
      { rootMargin: "200px" },
    );
  }

  $effect(() => {
    if (loadMoreSentinel && observer) {
      observer.observe(loadMoreSentinel);
    }
  });

  async function syncLikes() {
    try {
      const res = (await YandexApi.getFavoritesIds()) as { ids?: (string | number)[] } | null;
      if (res?.ids) {
        yandexFavorites.set(new Set(res.ids.map(String)));
      }
    } catch (e) {
      console.error("Sync likes failed", e);
    }
  }

  async function loadDashboard() {
    // Dedupe the onMount call and the view-change effect both firing on cold load.
    if (isLoading) return;
    isLoading = true;
    try {
      // allSettled: a single failing endpoint must not blank the whole board.
      const [userPlsR, landingR, moodR] = await Promise.allSettled([
        YandexApi.getUserPlaylists(),
        YandexApi.getLanding(),
        YandexApi.getStationsDashboard(),
      ]);

      const userPls = userPlsR.status === "fulfilled" ? (userPlsR.value as YandexPlaylist[] | null) : null;
      const landing = landingR.status === "fulfilled" ? (landingR.value as { personal?: YandexPlaylist[] } | null) : null;
      const moodData = moodR.status === "fulfilled" ? (moodR.value as { stations?: YandexPlaylist[] } | null) : null;

      const myVibe: YandexPlaylist = {
        uid: "my_vibe",
        kind: "my_vibe",
        title: "My Vibe",
        isStation: true,
        bgColor: "linear-gradient(135deg, #FFCC00, #FF3333)",
      };

      const moodStations = moodData?.stations ?? [];
      vibeCards = [myVibe, ...moodStations];

      const mappedPlaylists = (userPls ?? []).map((pl) => {
        if (pl.kind === "favorites") {
          const count =
            $yandexFavorites.size > 0
              ? $yandexFavorites.size
              : pl.trackCount || "\u2665";
          return { ...pl, trackCount: count };
        }
        return pl;
      });

      collectionCards = [...(landing?.personal ?? []), ...mappedPlaylists];

      // Only alarm the user if nothing at all could be loaded.
      if (userPlsR.status === "rejected" && landingR.status === "rejected" && moodR.status === "rejected") {
        reportError("Dashboard", moodR.reason, MSG.YANDEX_FAILED_DASHBOARD);
      }
    } catch (e) {
      reportError("Dashboard", e, MSG.YANDEX_FAILED_DASHBOARD);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    const favSize = $yandexFavorites.size;
    if (favSize > 0) {
      const cards = untrack(() => collectionCards);
      if (cards.length > 0) {
        collectionCards = cards.map((pl) => {
          if (pl.kind === "favorites") {
            return { ...pl, trackCount: favSize };
          }
          return pl;
        });
      }
    }
  });

  function openPlaylist(pl: YandexPlaylist) {
    if (pl.kind === "my_vibe") {
      showToast(MSG.startingMyVibe, "info");
      YandexApi.playRadio();
      return;
    }

    if (pl.kind === "station") {
      if (!pl.id) return;
      showToast(MSG.startingVibe(pl.title), "info");
      YandexApi.playStation(pl.id);
      return;
    }

    navigateTo("yandex_playlist", pl);
  }

  async function loadPlaylistData(data: Record<string, unknown>) {
    isLoading = true;
    canLoadMore = true;
    let uid = (data.uid as string | null) ?? null;
    let kind = (data.kind as string | null) ?? null;
    if (!uid && typeof data.id === "string" && data.id.includes(":")) {
      const parts = data.id.split(":");
      uid = parts[0];
      kind = parts[1];
    } else if (data.kind === "favorites") {
      kind = "favorites";
    }
    currentPlaylistContext = { uid, kind, offset: 0, type: "playlist" };
    try {
      await loadPlaylistTracks(uid, kind, 0);
    } catch (e) {
      reportError("Playlist", e, MSG.YANDEX_FAILED_PLAYLIST);
    } finally {
      isLoading = false;
    }
  }

  async function loadArtistData(data: Record<string, unknown>) {
    isLoading = true;
    canLoadMore = false;
    try {
      const res = (await YandexApi.getArtistDetails(String(data.id))) as {
        artist?: { name?: string; description?: string };
        cover?: string;
        tracks?: YandexTrack[];
        albums?: YandexAlbum[];
      } | null;

      const headerData = {
        name: res?.artist?.name ?? "",
        title: res?.artist?.name ?? "",
        description: res?.artist?.description ?? "",
        cover: res?.cover ?? null,
      };

      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active?.view === "yandex_artist_details") {
        active.data = { ...active.data, ...headerData };
        navigationStack.set(stack);
      }

      tracksStore.set(res?.tracks ?? []);
      albumsStore.set(res?.albums ?? []);

      // Cache immediately after load
      const key = getCacheKey("artist_details", data);
      saveToCache(key, {
        tracks: res?.tracks ?? [],
        albums: res?.albums ?? [],
        headerData,
      });
    } catch (e) {
      reportError("Artist", e, MSG.YANDEX_FAILED_ARTIST);
    } finally {
      isLoading = false;
    }
  }

  async function loadAlbumData(data: Record<string, unknown>) {
    isLoading = true;
    canLoadMore = false;
    try {
      const res = (await YandexApi.getAlbumDetails(String(data.id))) as {
        title?: string;
        artist?: string;
        cover?: string;
        tracks?: YandexTrack[];
      } | null;

      const headerData = {
        name: res?.title ?? "",
        title: res?.title ?? "",
        artist: res?.artist ?? "",
        cover: res?.cover ?? null,
      };

      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active?.view === "yandex_album_details") {
        active.data = { ...active.data, ...headerData };
        navigationStack.set(stack);
      }
      tracksStore.set(res?.tracks ?? []);

      // Cache immediately after load
      const key = getCacheKey("album_details", data);
      saveToCache(key, {
        tracks: res?.tracks ?? [],
        albums: [],
        headerData,
      });
    } catch (e) {
      reportError("Album", e, MSG.YANDEX_FAILED_ALBUM);
    } finally {
      isLoading = false;
    }
  }

  function openArtist(artist: YandexArtist) {
    navigateTo("yandex_artist_details", artist);
  }
  function openAlbum(album: YandexAlbum) {
    navigateTo("yandex_album_details", album);
  }

  async function loadPlaylistTracks(uid: string | null, kind: string | null, offset: number): Promise<number> {
    if (!uid || !kind) {
      canLoadMore = false;
      return 0;
    }
    const res = (await YandexApi.getPlaylistTracks(uid, kind, offset)) as { tracks?: YandexTrack[] } | null;
    const tracks = res?.tracks;
    if (tracks) {
      if (offset === 0) tracksStore.set(tracks);
      else tracksStore.update((curr) => [...curr, ...tracks]);
      if (tracks.length === 0) canLoadMore = false;
      return tracks.length;
    }
    canLoadMore = false;
    return 0;
  }

  async function loadMore() {
    if (isLoadingMore || !canLoadMore) return;
    isLoadingMore = true;
    const prevOffset = currentPlaylistContext.offset;
    try {
      currentPlaylistContext.offset += 50;
      if (currentPlaylistContext.type === "playlist") {
        const count = await loadPlaylistTracks(
          currentPlaylistContext.uid,
          currentPlaylistContext.kind,
          currentPlaylistContext.offset,
        );
        if (count === 0) canLoadMore = false;
      }
    } catch (e) {
      // Roll back the optimistic offset bump so a retry doesn't skip a page.
      currentPlaylistContext.offset = prevOffset;
      reportError("Load more", e, MSG.YANDEX_FAILED_PLAYLIST);
    } finally {
      isLoadingMore = false;
    }
  }

  function handleSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    searchQuery = val;
    clearTimeout(searchDebounceTimer);
    if (val.length >= 2) {
      searchDebounceTimer = setTimeout(() => {
        if (viewMode !== "search") {
          navigateTo("yandex_search", { query: val });
        } else {
          // Keep the active stack entry's query in sync so the view-cache key matches
          // the current term (otherwise back-navigation can restore stale results).
          const stack = get(navigationStack);
          const active = stack[stack.length - 1];
          if (active) {
            active.data = { ...active.data, query: val };
            navigationStack.set(stack);
          }
          performSearch();
        }
      }, 600);
    }
  }

  async function performSearch() {
    if (!searchQuery) return;
    const seq = ++searchSeq;
    const q = searchQuery;
    isLoading = true;
    searchResults = { tracks: [], albums: [], artists: [] };
    try {
      const res = (await YandexApi.search(q)) as Partial<YandexSearchResultsType> | null;
      if (seq !== searchSeq) return; // superseded by a newer search — drop stale result
      const normalized: YandexSearchResultsType = {
        tracks: res?.tracks ?? [],
        albums: res?.albums ?? [],
        artists: res?.artists ?? [],
      };
      searchResults = normalized;
      tracksStore.set(normalized.tracks);
    } catch (e) {
      if (seq === searchSeq) reportError("Search", e, MSG.YANDEX_FAILED_SEARCH);
    } finally {
      if (seq === searchSeq) isLoading = false;
    }
  }

  async function playAll() {
    const raw = get(tracksStore);
    if (!raw || raw.length === 0) {
      showToast(MSG.PLAY_NO_TRACKS, "error");
      return;
    }

    let contextName = "Yandex Playlist";
    if (currentView?.data) {
      contextName =
        (currentView.data.title as string) || (currentView.data.name as string) || contextName;
      if (viewMode === "artist_details") contextName = `Artist: ${contextName}`;
      if (viewMode === "album_details") contextName = `Album: ${contextName}`;
    }

    // For paged contexts (favorites / user playlists) hand the daemon a source
    // descriptor so it can keep fetching beyond the loaded page (e.g. 851 favs
    // while the UI only loaded 50). offset = how many we already sent.
    let source: PlaylistSource | null = null;
    if (viewMode === "playlist" && currentPlaylistContext.uid && currentPlaylistContext.kind) {
      source = {
        kind: currentPlaylistContext.kind,
        uid: String(currentPlaylistContext.uid),
        offset: raw.length,
      };
    }

    showToast(MSG.startingContext(contextName), "info");

    try {
      const res = (await YandexApi.playPlaylist(raw, contextName, source)) as { status?: string };
      if (res.status === "ok") {
        showToast(MSG.PLAY_PLAYING, "success");
      } else {
        showToast(MSG.PLAY_ERROR_STARTING, "error");
      }
    } catch (e) {
      console.error(e);
      showToast(MSG.PLAY_NETWORK_ERROR, "error");
    }
  }

  async function addAllToQueue() {
    const raw = get(tracksStore);
    if (!raw || raw.length === 0) return;
    showToast(MSG.addingTracks(raw.length), "info");
    try {
      const res = (await YandexApi.addTracksToQueue(raw)) as { status?: string };
      if (res.status === "ok") {
        showToast(MSG.PLAY_ADDED_TO_QUEUE, "success");
      }
    } catch (e) {
      console.error(e);
      showToast(MSG.PLAY_FAILED_TO_ADD, "error");
    }
  }

  async function playVibe(type: string) {
    const data = currentView?.data;
    if (!data || !data.id) return;

    showToast(MSG.startingTypeVibe(type), "info");
    try {
      await YandexApi.playRadio(String(data.id), type);
    } catch (e) {
      showToast(MSG.RADIO_FAILED_START_VIBE, "error");
    }
  }

</script>

<div class="view-container scrollable relative-parent">
  {#if !isTokenSet}
    <div class="token-alert content-padded">
      <h3>Yandex Music Not Connected</h3>
      <p>Please go to Settings and connect your account.</p>
    </div>
  {:else}
    {#if viewMode === "dashboard" || viewMode === "search"}
      <div class="content-padded no-bottom-pad">
        <div class="search-input-container">
          <span class="search-icon">{@html ICONS.SEARCH}</span>
          <input
            type="text"
            placeholder="Search Yandex Music..."
            bind:value={searchQuery}
            oninput={handleSearchInput}
          />
          {#if searchQuery}
            <button
              class="clear-btn"
              onclick={() => {
                searchQuery = "";
                if (viewMode === "search") window.history.back();
              }}
            >
              {@html ICONS.CLOSE}
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if viewMode === "dashboard"}
      <div class="content-padded" in:fade>
        <YandexDashboard
          {vibeCards}
          {collectionCards}
          {isLoading}
          onOpenPlaylist={(pl) => openPlaylist(pl)}
        />
      </div>
    {/if}

    {#if ["playlist", "search", "artist_details", "album_details"].includes(viewMode)}
      <BaseList
        itemsStore={tracksStore as unknown as import("svelte/store").Writable<Track[]>}
        {isLoading}
        isEditMode={false}
        emptyText="No tracks found"
      >
        {#snippet header()}
          <div class="content-padded">
            <YandexContentHeader
              headerData={(currentView?.data ?? null) as YandexHeaderData}
              {viewMode}
              {isLoading}
              tracksCount={$tracksStore.length}
              {albumsStore}
              onPlayAll={playAll}
              onAddAllToQueue={addAllToQueue}
              onPlayVibe={(type) => playVibe(type)}
              onOpenAlbum={(album) => openAlbum(album)}
            />

            {#if viewMode === "search"}
              <YandexSearchResults
                {searchResults}
                {isLoading}
                onOpenArtist={(artist) => openArtist(artist)}
                onOpenAlbum={(album) => openAlbum(album)}
              />
            {/if}
          </div>
        {/snippet}

        {#snippet row({ item, index })}
          <TrackRow
            track={item}
            {index}
            onplay={() => YandexApi.playTrack(String(item.id))}
          />
        {/snippet}

        {#snippet footer()}
          <div class="loading-footer">
            {#if isLoadingMore}<div class="spinner"></div>{/if}
            <div bind:this={loadMoreSentinel} style="height:20px;"></div>
          </div>
        {/snippet}
      </BaseList>
    {/if}
  {/if}
</div>

<style>

  .relative-parent {
    position: relative;
  }
  .token-alert {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 50vh;
    text-align: center;
    color: var(--c-text-secondary);
  }
  .search-input-container {
    display: flex;
    align-items: center;
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
    gap: 10px;
  }
  input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    outline: none;
    font-size: 15px;
  }
  .search-icon,
  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-text-muted);
    width: 20px;
    height: 20px;
  }
  .clear-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .loading-footer {
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .spinner {
    margin: 0 auto;
    border: 2px solid var(--c-border);
    border-top-color: var(--c-accent);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    100% {
      transform: rotate(360deg);
    }
  }

</style>
