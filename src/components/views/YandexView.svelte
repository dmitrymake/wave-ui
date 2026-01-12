<script>
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { writable, get } from "svelte/store";
  import { YandexApi } from "../../lib/yandex";
  import {
    yandexAuthStatus,
    showToast,
    yandexFavorites,
    yandexSearchTrigger,
    navigationStack,
    yandexContext,
    navigateTo,
  } from "../../lib/store";
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import ImageLoader from "../ImageLoader.svelte";
  import * as MPD from "../../lib/mpd";

  const tracksStore = writable([]);
  const albumsStore = writable([]);

  let vibeCards = [];
  let moodCards = [];
  let collectionCards = [];

  let isLoading = false;
  let isLoadingMore = false;

  let currentPlaylistContext = {
    uid: null,
    kind: null,
    offset: 0,
    type: "playlist",
  };
  let canLoadMore = true;
  let loadMoreSentinel;
  let observer;

  let searchQuery = "";
  let searchType = "all";
  let searchResults = { tracks: [], albums: [], artists: [] };
  let searchDebounceTimer;

  $: currentView = $navigationStack[$navigationStack.length - 1];
  $: viewMode = getModeFromStack(currentView);
  $: isTokenSet = $yandexAuthStatus;

  let uniqueViewKey = "";

  $: {
    const mode = getModeFromStack(currentView);
    const newKey = mode + JSON.stringify(currentView?.data || {});

    if (newKey !== uniqueViewKey) {
      uniqueViewKey = newKey;
      handleViewChange(mode, currentView?.data);
    }
  }

  $: if ($yandexSearchTrigger) {
    const term = $yandexSearchTrigger;
    yandexSearchTrigger.set(null);
    navigateTo("yandex_search", { query: term });
  }

  function getModeFromStack(view) {
    if (!view || view.view === "root") return "dashboard";
    if (view.view.startsWith("yandex_"))
      return view.view.replace("yandex_", "");
    return "dashboard";
  }

  async function handleViewChange(mode, data) {
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
      if (term) await performSearch();
    } else if (mode === "playlist") {
      await loadPlaylistData(data);
    } else if (mode === "artist_details") {
      await loadArtistData(data);
    } else if (mode === "album_details") {
      await loadAlbumData(data);
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

  $: if (loadMoreSentinel && observer) {
    observer.observe(loadMoreSentinel);
  }

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
      const userPls = await YandexApi.getUserPlaylists();
      const landing = await YandexApi.getLanding();
      const moodData = await YandexApi.getStationsDashboard();

      const myVibe = {
        title: "My Vibe",
        kind: "my_vibe",
        cover: null,
        isStation: true,
        description: "Endless flow based on your taste",
        bgColor: "linear-gradient(135deg, #a4508b, #5f0a87)",
      };

      vibeCards = [
        myVibe,
        ...(landing.moods || []),
        ...(landing.personal || []),
      ];

      if (moodData && moodData.stations) {
        moodCards = moodData.stations;
      }

      collectionCards = userPls;
    } catch (e) {
      showToast("Failed to load dashboard", "error");
    } finally {
      isLoading = false;
    }
  }

  async function loadPlaylistData(data) {
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

  async function loadArtistData(data) {
    isLoading = true;
    canLoadMore = false;
    try {
      const res = await YandexApi.getArtistDetails(data.id);

      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active.view === "yandex_artist_details") {
        active.data = {
          ...active.data,
          name: res.name,
          title: res.name,
          description: res.description,
          cover: res.cover,
        };
        navigationStack.set(stack);
      }

      tracksStore.set(res.tracks || []);
      albumsStore.set(res.albums || []);
    } finally {
      isLoading = false;
    }
  }

  async function loadAlbumData(data) {
    isLoading = true;
    canLoadMore = false;
    try {
      const res = await YandexApi.getAlbumDetails(data.id);

      const stack = get(navigationStack);
      const active = stack[stack.length - 1];
      if (active.view === "yandex_album_details") {
        active.data = {
          ...active.data,
          name: res.title,
          title: res.title,
          artist: res.artist,
          cover: res.cover,
        };
        navigationStack.set(stack);
      }

      tracksStore.set(res.tracks || []);
    } finally {
      isLoading = false;
    }
  }

  function openPlaylist(pl) {
    if (pl.kind === "my_vibe") {
      showToast("Starting My Vibe...", "info");
      YandexApi.playRadio();
      return;
    }
    if (pl.kind === "station") {
      showToast(`Starting ${pl.title}...`, "info");
      YandexApi.playStation(pl.id);
      return;
    }
    navigateTo("yandex_playlist", pl);
  }

  function openArtist(artist) {
    navigateTo("yandex_artist_details", artist);
  }

  function openAlbum(album) {
    navigateTo("yandex_album_details", album);
  }

  async function loadPlaylistTracks(uid, kind, offset) {
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
      const BATCH_SIZE = 50;
      currentPlaylistContext.offset += BATCH_SIZE;
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

  function handleSearchInput(e) {
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
    // FIX: Removed automatic history.back() on empty search
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

  function setSearchType(type) {
    searchType = type;
    if (searchResults.tracks) {
      if (type === "track") tracksStore.set(searchResults.tracks);
    }
  }

  function normalizeTracksAndCache(tracks) {
    const normalized = tracks.map((t) => {
      let artistName =
        t.artist ||
        (t.artists && t.artists.map((a) => a.name).join(", ")) ||
        "Unknown";
      let fullCoverUrl = t.image;
      if (!fullCoverUrl && (t.coverUri || t.cover)) {
        let clean = (t.coverUri || t.cover).replace("%%", "400x400");
        fullCoverUrl = clean.startsWith("http")
          ? clean
          : "https://" + clean.replace(/^\/\//, "");
      }
      return {
        ...t,
        artist: artistName,
        title: t.title || "Unknown Title",
        image: fullCoverUrl,
      };
    });
    yandexContext.update((ctx) => {
      const newCache = { ...ctx.streamCache };
      normalized.forEach((t) => {
        if (t.file) newCache[t.file] = t;
        if (t.id) newCache[String(t.id)] = t;
      });
      return { ...ctx, streamCache: newCache };
    });
    return normalized;
  }

  async function playAll() {
    const rawTracks = get(tracksStore);
    if (!rawTracks.length) return;
    const tracks = normalizeTracksAndCache(rawTracks);
    showToast("Adding tracks to queue...", "info");
    const res = await fetch("/wave-yandex-api.php?action=play_playlist", {
      method: "POST",
      body: JSON.stringify({ tracks }),
    });
    if (res.ok) {
      showToast("Playing...", "success");
      setTimeout(() => MPD.runMpdRequest("play 0"), 800);
    }
  }

  async function addAllToQueue() {
    const rawTracks = get(tracksStore);
    if (!rawTracks.length) return;
    const tracks = normalizeTracksAndCache(rawTracks);
    showToast(`Adding ${tracks.length} tracks...`, "info");
    const res = await fetch("/wave-yandex-api.php?action=add_tracks", {
      method: "POST",
      body: JSON.stringify({ tracks }),
    });
    if (res.ok) showToast("Added to queue", "success");
  }

  function handleHorizontalScroll(e) {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
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
            on:input={handleSearchInput}
          />
          {#if searchQuery}
            <button
              class="clear-btn"
              on:click={() => {
                searchQuery = "";
                if (viewMode === "search") window.history.back();
              }}
            >
              {@html ICONS.CLOSE}
            </button>
          {/if}
        </div>

        {#if viewMode === "search"}
          <div class="filter-tabs">
            <button
              class:active={searchType === "all"}
              on:click={() => setSearchType("all")}>All</button
            >
            <button
              class:active={searchType === "track"}
              on:click={() => setSearchType("track")}>Tracks</button
            >
          </div>
        {/if}
      </div>
    {/if}

    {#if viewMode === "dashboard"}
      <div class="content-padded" in:fade>
        <h2 class="header-label">For You</h2>
        <div
          class="music-grid horizontal section-mb"
          on:wheel={handleHorizontalScroll}
        >
          {#each vibeCards as item}
            <div class="music-card" on:click={() => openPlaylist(item)}>
              <div
                class="card-img-container"
                class:is-vibe={item.kind === "my_vibe"}
                style={item.bgColor && !item.is_vibe
                  ? `background: ${item.bgColor}`
                  : ""}
              >
                {#if item.kind === "my_vibe"}
                  <div class="icon-wrap">{@html ICONS.RADIO}</div>
                {:else if item.cover}
                  <ImageLoader src={item.cover} alt={item.title} radius="8px" />
                {:else}
                  <div class="icon-fallback">{@html ICONS.RADIO}</div>
                {/if}

                <div class="play-overlay">
                  <span class="overlay-icon"
                    >{@html item.kind === "my_vibe" || item.kind === "station"
                      ? ICONS.RADIO
                      : ICONS.PLAY}</span
                  >
                </div>
              </div>
              <div class="card-title">{item.title}</div>
            </div>
          {/each}
        </div>

        {#if moodCards.length > 0}
          <h2 class="header-label">Vibe by Mood</h2>
          <div
            class="music-grid horizontal section-mb"
            on:wheel={handleHorizontalScroll}
          >
            {#each moodCards as item}
              <div class="music-card" on:click={() => openPlaylist(item)}>
                <div
                  class="card-img-container"
                  style={`background-color: ${item.bgColor || "#333"}`}
                >
                  {#if item.cover}
                    <ImageLoader
                      src={item.cover}
                      alt={item.title}
                      radius="8px"
                    />
                  {:else}
                    <div class="icon-wrap">{@html ICONS.RADIO}</div>
                  {/if}

                  <div class="play-overlay">
                    <span class="overlay-icon">{@html ICONS.RADIO}</span>
                  </div>
                </div>
                <div class="card-title">{item.title}</div>
              </div>
            {/each}
          </div>
        {/if}

        {#if collectionCards.length > 0}
          <h2 class="header-label">My Collection</h2>
          <div
            class="music-grid horizontal section-mb"
            on:wheel={handleHorizontalScroll}
          >
            {#each collectionCards as pl}
              {@const isFav = pl.kind === "favorites"}
              <div class="music-card" on:click={() => openPlaylist(pl)}>
                <div
                  class="card-img-container"
                  style={isFav
                    ? "background: linear-gradient(135deg, hsl(348, 95%, 58%), hsl(348, 90%, 40%));"
                    : ""}
                >
                  {#if isFav}
                    <div class="icon-wrap">{@html ICONS.HEART_FILLED}</div>
                  {:else}
                    <ImageLoader src={pl.cover} alt={pl.title} radius="8px">
                      <div slot="fallback" class="icon-fallback">
                        {@html ICONS.PLAYLISTS}
                      </div>
                    </ImageLoader>
                  {/if}
                  <div class="play-overlay">
                    <span class="overlay-icon">{@html ICONS.PLAY}</span>
                  </div>
                </div>
                <div class="card-title">{pl.title}</div>
                {#if pl.trackCount}
                  <div class="card-sub">{pl.trackCount} tracks</div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if ["playlist", "search", "artist_details", "album_details"].includes(viewMode)}
      <BaseList
        itemsStore={tracksStore}
        {isLoading}
        isEditMode={false}
        emptyText="No tracks found"
      >
        <div slot="header" class="content-padded">
          {#if viewMode !== "search" && currentView.data}
            {@const headerData = currentView.data}
            <div class="view-header">
              <div
                class="header-art"
                style={headerData.kind === "favorites"
                  ? "background: linear-gradient(135deg, hsl(348, 95%, 58%), hsl(348, 90%, 40%));"
                  : ""}
              >
                {#if headerData.kind === "favorites"}
                  <div
                    class="icon-wrap"
                    style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"
                  >
                    {@html ICONS.HEART_FILLED}
                  </div>
                {:else}
                  <ImageLoader
                    src={headerData.cover || headerData.image}
                    alt={headerData.title}
                    radius="8px"
                  >
                    <div slot="fallback" class="icon-fallback">
                      {@html ICONS.ALBUMS}
                    </div>
                  </ImageLoader>
                {/if}
              </div>
              <div class="header-info">
                <div class="header-text-group">
                  <div class="header-label">
                    {viewMode.includes("artist")
                      ? "Artist"
                      : viewMode.includes("album")
                        ? "Album"
                        : "Playlist"}
                  </div>
                  <h1 class="header-title" title={headerData.title}>
                    {headerData.title || headerData.name || "Loading..."}
                  </h1>
                  {#if headerData.description || headerData.artist}
                    <div class="header-subtitle-row">
                      <h2 class="header-sub-text">
                        {headerData.artist || headerData.description}
                      </h2>
                    </div>
                  {/if}
                  <div class="meta-badges">
                    <span class="meta-tag">{$tracksStore.length} tracks</span>
                    <span class="meta-tag">Yandex</span>
                  </div>
                </div>
                <div class="header-actions">
                  <button class="btn-primary" on:click={playAll}
                    >Play All</button
                  >
                  <button class="btn-secondary" on:click={addAllToQueue}
                    >To Queue</button
                  >
                </div>
              </div>
            </div>
          {/if}

          {#if viewMode === "search" && !isLoading}
            {#if searchResults.artists.length > 0 && searchType === "all"}
              <h3 class="header-label">Artists</h3>
              <div
                class="music-grid horizontal section-mb"
                on:wheel={handleHorizontalScroll}
              >
                {#each searchResults.artists as artist}
                  <div class="music-card" on:click={() => openArtist(artist)}>
                    <div class="card-img-container">
                      <ImageLoader
                        src={artist.image}
                        alt={artist.title}
                        radius="8px"
                      />
                    </div>
                    <div class="card-title center">{artist.title}</div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if searchResults.albums.length > 0 && searchType === "all"}
              <h3 class="header-label">Albums</h3>
              <div
                class="music-grid horizontal section-mb"
                on:wheel={handleHorizontalScroll}
              >
                {#each searchResults.albums as album}
                  <div class="music-card" on:click={() => openAlbum(album)}>
                    <div class="card-img-container">
                      <ImageLoader
                        src={album.image}
                        alt={album.title}
                        radius="8px"
                      />
                    </div>
                    <div class="card-title">{album.title}</div>
                    <div class="card-sub">{album.artist}</div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}

          {#if viewMode.includes("artist") && $albumsStore.length > 0}
            <div class="header-label section-spacing" style="margin-top: 24px;">
              Albums
            </div>
            <div
              class="music-grid horizontal section-mb"
              on:wheel={handleHorizontalScroll}
            >
              {#each $albumsStore as album}
                <div class="music-card" on:click={() => openAlbum(album)}>
                  <div class="card-img-container">
                    <ImageLoader
                      src={album.image}
                      alt={album.title}
                      radius="8px"
                    />
                    <div class="play-overlay">
                      <span class="overlay-icon">{@html ICONS.PLAY}</span>
                    </div>
                  </div>
                  <div class="card-title">{album.title}</div>
                  <div class="card-sub">{album.year}</div>
                </div>
              {/each}
            </div>
            <div class="header-label section-spacing">Popular Tracks</div>
          {/if}
        </div>

        <div slot="row" let:item let:index>
          <TrackRow
            track={item}
            {index}
            on:play={() => YandexApi.playTrack(item.id)}
            on:artistclick={() => {}}
          />
        </div>

        <div slot="footer" class="loading-footer">
          {#if isLoadingMore}<div class="spinner"></div>{/if}
          <div
            bind:this={loadMoreSentinel}
            style="height: 20px; width: 100%;"
          ></div>
        </div>
      </BaseList>
    {/if}
  {/if}
</div>

<style>
  @import "./MusicViews.css";

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
  .filter-tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    overflow-x: auto;
  }
  .filter-tabs button {
    background: var(--c-surface-button);
    border: 1px solid var(--c-border);
    color: var(--c-text-secondary);
    padding: 6px 12px;
    border-radius: 16px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .filter-tabs button.active {
    background: var(--c-accent);
    color: #fff;
    border-color: var(--c-accent);
  }
  .card-img-container.is-vibe {
    background: linear-gradient(135deg, #a4508b, #5f0a87);
  }
  .card-title.center {
    text-align: center;
  }
  .icon-wrap {
    width: 40%;
    height: 40%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }
  .icon-wrap :global(svg) {
    width: 40px;
    height: 40px;
  }
  .icon-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--c-icon-faint);
    background: var(--c-bg-placeholder);
  }
  .icon-fallback :global(svg) {
    width: 40px;
    height: 40px;
    opacity: 0.5;
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
  .header-subtitle-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 6px 0;
  }
  .header-sub-text {
    font-size: 20px;
    color: var(--c-white-60);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 400;
  }
</style>
