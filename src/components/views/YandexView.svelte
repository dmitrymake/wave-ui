<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { writable, get } from "svelte/store";
  import { YandexApi, isYandexAuthError, type PlaylistSource } from "../../lib/yandex";
  import { ViewCache, getModeFromStack } from "../../lib/yandexViewCache";
  import { logger } from "../../lib/logger";
  import {
    showToast,
    navigationStack,
    navigateTo,
    navigateBack,
    updateTopEntry,
    navIdentityKey,
  } from "../../lib/store";
  import {
    yandexAuthStatus,
    yandexFavorites,
    yandexSearchTrigger,
  } from "../../lib/stores/yandex";
  import { MSG } from "../../lib/messages";
  import { artistTarget, albumTarget } from "../../lib/yandexNav";
  import { yandexSource, yandexTrackToTrack } from "../../lib/sources/yandexSource";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import YandexDashboard from "./YandexDashboard.svelte";
  import YandexSearchResults from "./YandexSearchResults.svelte";
  import YandexContentHeader from "./YandexContentHeader.svelte";
  import YandexNotConnected from "./yandex/YandexNotConnected.svelte";
  import YandexSearchBar from "./yandex/YandexSearchBar.svelte";
  import type { YandexTrack, YandexAlbum, YandexArtist, YandexPlaylist, YandexSearchResults as YandexSearchResultsType, YandexHeaderData } from "../../lib/types/yandex";

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
    logger.error(`[YandexView] ${label}:`, e);
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

  // Monotonic load token: async detail loads capture it and drop the result
  // when a newer navigation has started (fixes "opened B, see A" overwrites).
  let viewSeq = 0;

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
      updateTopEntry(cached.headerData as Record<string, unknown>);
    }
    // Restored content is final: clear any spinner left by a superseded load
    // (its seq-guarded finally skips the reset).
    isLoading = false;
    isLoadingMore = false;
    return true;
  }

  $effect(() => {
    const mode = getModeFromStack(currentView);
    // Stable identity: header merges (name/cover/…) must not retrigger loads.
    const newKey = navIdentityKey(mode, (currentView?.data ?? null) as Record<string, unknown> | null);

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

  async function handleViewChange(mode: string, data: Record<string, unknown> | null) {
    const seq = ++viewSeq;
    // Save current view to cache before switching
    const prevKey = untrack(() => {
      const prevMode = viewMode;
      if (prevMode && prevMode !== mode && prevMode !== "dashboard") {
        return navIdentityKey(prevMode, ($navigationStack[$navigationStack.length - 2]?.data ?? null) as Record<string, unknown> | null);
      }
      return null;
    });

    if (prevKey && prevKey !== navIdentityKey(mode, data)) {
      saveToCache(prevKey, {
        tracks: get(tracksStore),
        albums: get(albumsStore),
        searchResults: searchResults.tracks.length > 0 ? { ...searchResults } : undefined,
        playlistContext: { ...currentPlaylistContext },
        canLoadMore,
      });
    }

    // Try restore from cache
    const cacheKey = navIdentityKey(mode, data);

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
        await loadPlaylistData(data ?? {}, seq);
      }
    } else if (mode === "artist_details") {
      if (!restoreFromCache(cacheKey)) {
        await loadArtistData(data ?? {}, seq);
      }
    } else if (mode === "album_details") {
      if (!restoreFromCache(cacheKey)) {
        await loadAlbumData(data ?? {}, seq);
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
      const res = await YandexApi.getFavoritesIds();
      if (res?.ids) {
        yandexFavorites.set(new Set(res.ids.map(String)));
      }
    } catch (e) {
      logger.error("Sync likes failed", e);
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

      const userPls = userPlsR.status === "fulfilled" ? userPlsR.value : null;
      const landing = landingR.status === "fulfilled" ? landingR.value : null;
      const moodData = moodR.status === "fulfilled" ? moodR.value : null;

      const myVibe: YandexPlaylist = {
        uid: "my_vibe",
        kind: "my_vibe",
        title: "My Vibe",
        isStation: true,
        bgColor: "var(--grad-vibe)",
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

  async function loadPlaylistData(data: Record<string, unknown>, seq: number) {
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
      await loadPlaylistTracks(uid, kind, 0, seq);
    } catch (e) {
      if (seq !== viewSeq) return;
      reportError("Playlist", e, MSG.YANDEX_FAILED_PLAYLIST);
    } finally {
      if (seq === viewSeq) isLoading = false;
    }
  }

  async function loadArtistData(data: Record<string, unknown>, seq: number) {
    if (data.id === undefined || data.id === null || data.id === "") {
      logger.error("[YandexView] artist_details without id, refusing to fetch 'undefined'");
      reportError("Artist", new Error("missing artist id"), MSG.YANDEX_FAILED_ARTIST);
      isLoading = false;
      return;
    }
    isLoading = true;
    canLoadMore = false;
    try {
      const res = await YandexApi.getArtistDetails(String(data.id));
      if (seq !== viewSeq) return; // superseded — a newer view is active

      // Nameless + contentless = backend fluke, not an artist: reject it so a
      // blank header is never merged and the empty page is never cached.
      const hasIdentity = !!res?.artist?.name;
      const hasContent = (res?.tracks?.length ?? 0) > 0 || (res?.albums?.length ?? 0) > 0;
      if (!hasIdentity && !hasContent) {
        reportError("Artist", new Error("empty artist response"), MSG.YANDEX_FAILED_ARTIST);
        return;
      }

      const headerData = {
        name: res?.artist?.name ?? "",
        title: res?.artist?.name ?? "",
        description: res?.artist?.description ?? "",
        cover: res?.cover ?? null,
      };

      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active?.view === "yandex_artist_details" && headerData.title) {
        updateTopEntry(headerData as Record<string, unknown>);
      }

      tracksStore.set(res?.tracks ?? []);
      albumsStore.set(res?.albums ?? []);

      const key = navIdentityKey("artist_details", data);
      saveToCache(key, {
        tracks: res?.tracks ?? [],
        albums: res?.albums ?? [],
        headerData,
      });
    } catch (e) {
      if (seq !== viewSeq) return;
      reportError("Artist", e, MSG.YANDEX_FAILED_ARTIST);
    } finally {
      if (seq === viewSeq) isLoading = false;
    }
  }

  async function loadAlbumData(data: Record<string, unknown>, seq: number) {
    if (data.id === undefined || data.id === null || data.id === "") {
      logger.error("[YandexView] album_details without id, refusing to fetch 'undefined'");
      reportError("Album", new Error("missing album id"), MSG.YANDEX_FAILED_ALBUM);
      isLoading = false;
      return;
    }
    isLoading = true;
    canLoadMore = false;
    try {
      const res = await YandexApi.getAlbumDetails(String(data.id));
      if (seq !== viewSeq) return; // superseded — a newer view is active

      // Titleless + trackless = fluke (same guard as artists).
      if (!res?.title && !(res?.tracks?.length ?? 0)) {
        reportError("Album", new Error("empty album response"), MSG.YANDEX_FAILED_ALBUM);
        return;
      }

      const headerData = {
        name: res?.title ?? "",
        title: res?.title ?? "",
        artist: res?.artist ?? "",
        cover: res?.cover ?? null,
      };

      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active?.view === "yandex_album_details" && headerData.title) {
        updateTopEntry(headerData as Record<string, unknown>);
      }
      tracksStore.set(res?.tracks ?? []);

      const key = navIdentityKey("album_details", data);
      saveToCache(key, {
        tracks: res?.tracks ?? [],
        albums: [],
        headerData,
      });
    } catch (e) {
      if (seq !== viewSeq) return;
      reportError("Album", e, MSG.YANDEX_FAILED_ALBUM);
    } finally {
      if (seq === viewSeq) isLoading = false;
    }
  }

  function openArtist(artist: YandexArtist) {
    // Id-less entries can't open details — fall back to a title search.
    const target = artistTarget(artist);
    if (target) navigateTo(target.view, target.data);
    else {
      logger.warn("[YandexView] openArtist with no id or title, ignoring");
      showToast(MSG.YANDEX_FAILED_ARTIST, "error");
    }
  }
  function openAlbum(album: YandexAlbum) {
    const target = albumTarget(album);
    if (target) navigateTo(target.view, target.data);
    else {
      logger.warn("[YandexView] openAlbum with no id or title, ignoring");
      showToast(MSG.YANDEX_FAILED_ALBUM, "error");
    }
  }

  async function loadPlaylistTracks(
    uid: string | null,
    kind: string | null,
    offset: number,
    seq?: number,
  ): Promise<number> {
    if (!uid || !kind) {
      canLoadMore = false;
      return 0;
    }
    const res = await YandexApi.getPlaylistTracks(uid, kind, offset);
    if (seq !== undefined && seq !== viewSeq) return 0; // superseded
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
    const seq = viewSeq;
    const prevOffset = currentPlaylistContext.offset;
    try {
      currentPlaylistContext.offset += 50;
      if (currentPlaylistContext.type === "playlist") {
        const count = await loadPlaylistTracks(
          currentPlaylistContext.uid,
          currentPlaylistContext.kind,
          currentPlaylistContext.offset,
          seq,
        );
        if (seq !== viewSeq) return;
        if (count === 0) canLoadMore = false;
      }
    } catch (e) {
      if (seq !== viewSeq) return;
      // Roll back the optimistic offset bump so a retry doesn't skip a page.
      currentPlaylistContext.offset = prevOffset;
      reportError("Load more", e, MSG.YANDEX_FAILED_PLAYLIST);
    } finally {
      if (seq === viewSeq) isLoadingMore = false;
    }
  }

  function handleSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    searchQuery = val;
    clearTimeout(searchDebounceTimer);
    if (val.length >= 2) {
      searchDebounceTimer = setTimeout(() => {
        // The bar lives in dashboard + search views. If the user opened a
        // detail view while debouncing, abandon instead of yanking them back.
        const mode = getModeFromStack(get(navigationStack)[get(navigationStack).length - 1]);
        if (mode === "search") {
          // Keep the entry query in sync so the cache key matches the term.
          updateTopEntry({ query: val });
          performSearch();
        } else if (mode === "dashboard") {
          navigateTo("yandex_search", { query: val });
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
      const res = await YandexApi.search(q);
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
      const res = await YandexApi.playPlaylist(raw, contextName, source);
      if (res.status === "ok") {
        showToast(MSG.PLAY_PLAYING, "success");
      } else {
        showToast(MSG.PLAY_ERROR_STARTING, "error");
      }
    } catch (e) {
      logger.error(e);
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
      logger.error(e);
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
    <YandexNotConnected />
  {:else}
    {#if viewMode === "dashboard" || viewMode === "search"}
      <YandexSearchBar
        bind:value={searchQuery}
        oninput={handleSearchInput}
        onClear={() => {
          searchQuery = "";
          if (viewMode === "search") navigateBack();
        }}
      />
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
          <!-- Tag list items with the neutral source id so TrackRow/LikeButton
               resolve the owning source from the registry (no isYandex flag). -->
          <TrackRow
            track={yandexTrackToTrack(item, yandexSource.id)}
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

  .loading-footer {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .spinner {
    margin: var(--space-0) auto;
    border: var(--border-width-thick) solid var(--c-border);
    border-top-color: var(--c-accent);
    border-radius: var(--radius-circle);
    width: 20px;
    height: 20px;
    animation: spin 1s var(--ease-linear) infinite;
  }
  @keyframes spin {
    100% {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
  }

</style>
