<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { writable, get } from "svelte/store";
  import { YandexApi } from "../../lib/yandex";
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
  import type { YandexTrack, YandexAlbum, YandexArtist, YandexPlaylist, YandexSearchResults as YandexSearchResultsType, NavigationEntry } from "../../lib/types";

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
  let searchType = $state("all");
  let searchResults = $state<YandexSearchResultsType>({ tracks: [], albums: [], artists: [] });
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

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
  const viewCache = new Map<string, ViewCacheEntry>();
  const MAX_CACHE_SIZE = 20;

  function getCacheKey(mode: string, data: Record<string, unknown> | null): string {
    return mode + JSON.stringify(data || {});
  }

  function saveToCache(key: string, entry: ViewCacheEntry) {
    viewCache.set(key, entry);
    if (viewCache.size > MAX_CACHE_SIZE) {
      const firstKey = viewCache.keys().next().value;
      if (firstKey) viewCache.delete(firstKey);
    }
  }

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
      handleViewChange(mode, currentView?.data);
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
      const term = data?.query || "";
      searchQuery = term;
      if (term) {
        if (!restoreFromCache(cacheKey)) {
          await performSearch();
        }
      }
    } else if (mode === "playlist") {
      if (!restoreFromCache(cacheKey)) {
        await loadPlaylistData(data);
      }
    } else if (mode === "artist_details") {
      if (!restoreFromCache(cacheKey)) {
        await loadArtistData(data);
      }
    } else if (mode === "album_details") {
      if (!restoreFromCache(cacheKey)) {
        await loadAlbumData(data);
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
      const res = await YandexApi.getFavoritesIds();
      if (res && res.ids) {
        yandexFavorites.set(new Set(res.ids.map(String)));
      }
    } catch (e) {
      console.error("Sync likes failed", e);
    }
  }

  async function loadDashboard() {
    isLoading = true;
    try {
      const [userPls, landing, moodData] = await Promise.all([
        YandexApi.getUserPlaylists(),
        YandexApi.getLanding(),
        YandexApi.getStationsDashboard(),
      ]);

      const myVibe = {
        title: "My Vibe",
        kind: "my_vibe",
        cover: null,
        isStation: true,
        bgColor: "linear-gradient(135deg, #FFCC00, #FF3333)",
      };

      const moodStations = moodData.stations || [];
      vibeCards = [myVibe, ...moodStations];

      const mappedPlaylists = (userPls || []).map((pl) => {
        if (pl.kind === "favorites") {
          const count =
            $yandexFavorites.size > 0
              ? $yandexFavorites.size
              : pl.trackCount || "\u2665";
          return { ...pl, trackCount: count };
        }
        return pl;
      });

      collectionCards = [...(landing.personal || []), ...mappedPlaylists];
    } catch (e) {
      console.error("[YandexView] Dashboard Error:", e);
      showToast(MSG.YANDEX_FAILED_DASHBOARD, "error");
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
      showToast(MSG.startingVibe(pl.title), "info");
      YandexApi.playStation(pl.id);
      return;
    }

    navigateTo("yandex_playlist", pl);
  }

  async function loadPlaylistData(data: Record<string, unknown>) {
    isLoading = true;
    canLoadMore = true;
    let uid = data.uid;
    let kind = data.kind;
    if (
      !uid &&
      data.id &&
      typeof data.id === "string" &&
      data.id.includes(":")
    ) {
      const parts = data.id.split(":");
      uid = parts[0];
      kind = parts[1];
    } else if (data.kind === "favorites") {
      kind = "favorites";
    }
    currentPlaylistContext = { uid, kind, offset: 0, type: "playlist" };
    try {
      await loadPlaylistTracks(uid, kind, 0);
    } finally {
      isLoading = false;
    }
  }

  async function loadArtistData(data: Record<string, unknown>) {
    isLoading = true;
    canLoadMore = false;
    try {
      const res = await YandexApi.getArtistDetails(data.id);

      const headerData = {
        name: res.artist.name,
        title: res.artist.name,
        description: res.artist.description,
        cover: res.cover,
      };

      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active.view === "yandex_artist_details") {
        active.data = { ...active.data, ...headerData };
        navigationStack.set(stack);
      }

      tracksStore.set(res.tracks || []);
      albumsStore.set(res.albums || []);

      // Cache immediately after load
      const key = getCacheKey("artist_details", data);
      saveToCache(key, {
        tracks: res.tracks || [],
        albums: res.albums || [],
        headerData,
      });
    } finally {
      isLoading = false;
    }
  }

  async function loadAlbumData(data: Record<string, unknown>) {
    isLoading = true;
    canLoadMore = false;
    try {
      const res = await YandexApi.getAlbumDetails(data.id);

      const headerData = {
        name: res.title,
        title: res.title,
        artist: res.artist,
        cover: res.cover,
      };

      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active.view === "yandex_album_details") {
        active.data = { ...active.data, ...headerData };
        navigationStack.set(stack);
      }
      tracksStore.set(res.tracks || []);

      // Cache immediately after load
      const key = getCacheKey("album_details", data);
      saveToCache(key, {
        tracks: res.tracks || [],
        albums: [],
        headerData,
      });
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

  async function loadPlaylistTracks(uid: string, kind: string, offset: number) {
    const res = await YandexApi.getPlaylistTracks(uid, kind, offset);
    if (res && res.tracks) {
      if (offset === 0) tracksStore.set(res.tracks);
      else tracksStore.update((curr) => [...curr, ...res.tracks]);
      if (res.tracks.length === 0) canLoadMore = false;
      return res.tracks.length;
    }
    canLoadMore = false;
    return 0;
  }

  async function loadMore() {
    if (isLoadingMore || !canLoadMore) return;
    isLoadingMore = true;
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
    } finally {
      isLoadingMore = false;
    }
  }

  function handleSearchInput(e: Event) {
    const val = e.target.value;
    searchQuery = val;
    clearTimeout(searchDebounceTimer);
    if (val.length >= 2) {
      searchDebounceTimer = setTimeout(() => {
        if (viewMode !== "search") {
          navigateTo("yandex_search", { query: val });
        } else {
          performSearch();
        }
      }, 600);
    }
  }

  async function performSearch() {
    if (!searchQuery) return;
    isLoading = true;
    searchResults = { tracks: [], albums: [], artists: [] };
    try {
      const res = await YandexApi.search(searchQuery);
      if (res) {
        searchResults = res;
        if (searchType === "track" || searchType === "all") {
          tracksStore.set(res.tracks || []);
        }
      }
    } finally {
      isLoading = false;
    }
  }

  function setSearchType(type: string) {
    searchType = type;
    if (searchResults.tracks && type === "track")
      tracksStore.set(searchResults.tracks);
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
        currentView.data.title || currentView.data.name || contextName;
      if (viewMode === "artist_details") contextName = `Artist: ${contextName}`;
      if (viewMode === "album_details") contextName = `Album: ${contextName}`;
    }

    showToast(MSG.startingContext(contextName), "info");

    try {
      const res = await YandexApi.playPlaylist(raw, contextName);
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
      const res = await YandexApi.addTracksToQueue(raw);
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
      await YandexApi.playRadio(data.id, type);
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
        itemsStore={tracksStore}
        {isLoading}
        isEditMode={false}
        emptyText="No tracks found"
      >
        {#snippet header()}
          <div class="content-padded">
            <YandexContentHeader
              headerData={currentView?.data}
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
            onplay={() => YandexApi.playTrack(item.id)}
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
