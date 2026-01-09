<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { YandexApi } from "../../lib/yandex";
  import { yandexToken, showToast, yandexContext } from "../../lib/store";
  import { ICONS } from "../../lib/icons";
  import { playYandexContext } from "../../lib/mpd/index";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import Skeleton from "../Skeleton.svelte";
  import ImageLoader from "../ImageLoader.svelte";
  import { writable } from "svelte/store";

  const tracksStore = writable([]);
  let playlists = [];
  let isLoading = false;
  let viewMode = "dashboard";
  let activePlaylistName = "";
  let activePlaylistData = null;

  let searchQuery = "";
  let searchType = "all";
  let searchResults = { tracks: [], albums: [], artists: [] };
  let searchTimer;

  let page = 0;
  let hasMore = true;
  let showLoadMoreButton = false;
  let observer;
  let sentinel;

  $: isTokenSet = !!$yandexToken;

  onMount(() => {
    if (isTokenSet) {
      loadDashboard();
    }
    return () => {
      if (observer) observer.disconnect();
    };
  });

  // Setup observer for the sentinel element
  function setupObserver(node) {
    sentinel = node;
    if (observer) observer.disconnect();

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // If sentinel is visible, user is at bottom
        showLoadMoreButton = entry.isIntersecting && hasMore && !isLoading;
      },
      {
        root: null, // viewport
        rootMargin: "0px",
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);

    return {
      destroy() {
        if (observer) observer.disconnect();
      },
    };
  }

  async function loadDashboard() {
    isLoading = true;
    try {
      const userPlaylists = await YandexApi.getUserPlaylists();
      playlists = [
        {
          kind: "favorites",
          title: "Favorites",
          cover: { uri: null },
          trackCount: "♥",
        },
        ...userPlaylists,
      ];
    } catch (e) {
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  async function openPlaylist(pl) {
    isLoading = true;
    viewMode = "playlist";
    activePlaylistName = pl.title;
    activePlaylistData = pl;
    tracksStore.set([]);
    page = 0;
    hasMore = true;
    showLoadMoreButton = false;

    await loadMoreTracks();
  }

  async function loadMoreTracks() {
    if (!hasMore && page > 0) return;
    isLoading = true;
    showLoadMoreButton = false;

    try {
      let res;
      if (activePlaylistData.kind === "favorites") {
        res = await YandexApi.getFavorites(page);
      } else if (activePlaylistData.kind === "album") {
        if (page === 0) {
          const tracks = await YandexApi.getAlbumTracks(activePlaylistData.id);
          res = { tracks, total: tracks.length };
        } else {
          res = { tracks: [], total: 0 };
        }
      } else if (activePlaylistData.kind === "artist") {
        if (page === 0) {
          const tracks = await YandexApi.getArtistTracks(activePlaylistData.id);
          res = { tracks, total: tracks.length };
        } else {
          res = { tracks: [], total: 0 };
        }
      } else {
        res = await YandexApi.getPlaylistTracks(
          activePlaylistData.kind,
          activePlaylistData.uid,
          page,
        );
      }

      if (res.tracks.length === 0) {
        hasMore = false;
      } else {
        tracksStore.update((curr) => [...curr, ...res.tracks]);
        page++;
        if (res.tracks.length < 50) hasMore = false;
      }
    } catch (e) {
      showToast("Failed to load tracks", "error");
      hasMore = false;
    } finally {
      isLoading = false;
    }
  }

  function handleSearchInput(e) {
    searchQuery = e.target.value;
    clearTimeout(searchTimer);

    if (searchQuery.length > 2) {
      searchTimer = setTimeout(() => {
        performSearch();
      }, 600);
    } else if (searchQuery.length === 0) {
      viewMode = "dashboard";
    }
  }

  function setSearchType(type) {
    searchType = type;
    if (searchQuery.length > 2) performSearch();
  }

  async function performSearch() {
    isLoading = true;
    viewMode = "search";
    searchResults = { tracks: [], albums: [], artists: [] };

    try {
      const res = await YandexApi.search(
        searchQuery,
        searchType === "all" ? "all" : searchType,
        0,
      );
      searchResults = res;
      if (searchType === "track" || searchType === "all") {
        tracksStore.set(res.tracks);
      } else {
        tracksStore.set([]);
      }
    } catch (e) {
      showToast("Search failed", "error");
    } finally {
      isLoading = false;
    }
  }

  async function openAlbum(album) {
    isLoading = true;
    viewMode = "playlist";
    activePlaylistName = album.title;
    activePlaylistData = { kind: "album", id: album.id };
    tracksStore.set([]);
    page = 0;
    hasMore = true;
    await loadMoreTracks();
  }

  async function openArtist(artist) {
    isLoading = true;
    viewMode = "playlist";
    activePlaylistName = artist.name;
    activePlaylistData = { kind: "artist", id: artist.id };
    tracksStore.set([]);
    page = 0;
    hasMore = true;
    await loadMoreTracks();
  }

  function goBack() {
    viewMode = "dashboard";
    searchQuery = "";
    tracksStore.set([]);
  }

  async function handlePlay(index) {
    playYandexContext($tracksStore, index);
  }

  function getCover(pl) {
    if (pl.kind === "favorites") return null;
    if (pl.cover && pl.cover.uri) {
      return `https://${pl.cover.uri.replace("%%", "200x200")}`;
    }
    return null;
  }
</script>

<div class="view-container scrollable relative-parent">
  {#if !isTokenSet}
    <div class="token-alert content-padded">
      <h3>Yandex Music Token Required</h3>
      <p>Please go to Settings and enter your OAuth token.</p>
    </div>
  {:else}
    <div class="content-padded no-bottom-pad">
      <div class="search-input-container">
        {#if viewMode !== "dashboard"}
          <button class="back-icon-btn" on:click={goBack}>
            {@html ICONS.BACK}
          </button>
        {:else}
          <span class="search-icon">{@html ICONS.SEARCH}</span>
        {/if}

        <input
          type="text"
          placeholder="Search Yandex Music..."
          bind:value={searchQuery}
          on:input={handleSearchInput}
        />

        {#if searchQuery}
          <button class="clear-btn" on:click={goBack}>
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
          <button
            class:active={searchType === "album"}
            on:click={() => setSearchType("album")}>Albums</button
          >
          <button
            class:active={searchType === "artist"}
            on:click={() => setSearchType("artist")}>Artists</button
          >
        </div>
      {/if}
    </div>

    {#if viewMode === "dashboard"}
      <div class="content-padded" in:fade>
        <h2 class="header-label">My Music</h2>

        {#if isLoading}
          <div class="music-grid">
            {#each Array(6) as _}
              <div class="music-card skeleton-card">
                <Skeleton
                  width="100%"
                  style="aspect-ratio:1; border-radius:12px; margin-bottom: 8px;"
                />
                <Skeleton width="70%" height="14px" />
              </div>
            {/each}
          </div>
        {:else}
          <div class="music-grid">
            {#each playlists as pl}
              <div class="music-card" on:click={() => openPlaylist(pl)}>
                <div
                  class="card-img-container"
                  class:is-fav={pl.kind === "favorites"}
                >
                  {#if pl.kind === "favorites"}
                    <div class="icon-wrap">{@html ICONS.HEART_FILLED}</div>
                  {:else if getCover(pl)}
                    <img src={getCover(pl)} alt={pl.title} loading="lazy" />
                  {:else}
                    <div class="icon-wrap">{@html ICONS.PLAYLISTS}</div>
                  {/if}
                  <div class="play-overlay">
                    <span class="overlay-icon">{@html ICONS.PLAY}</span>
                  </div>
                </div>
                <div class="card-title">{pl.title}</div>
                <div class="card-sub">{pl.trackCount} tracks</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if viewMode === "search"}
      <div class="content-padded">
        {#if searchResults.albums.length > 0 && (searchType === "all" || searchType === "album")}
          <h3 class="header-label">Albums</h3>
          <div class="music-grid horizontal section-mb">
            {#each searchResults.albums as album}
              <div class="music-card" on:click={() => openAlbum(album)}>
                <div class="card-img-container">
                  <ImageLoader src={album.image} alt={album.title} radius="8px">
                    <div slot="fallback" class="icon-fallback">
                      {@html ICONS.ALBUMS}
                    </div>
                  </ImageLoader>
                </div>
                <div class="card-title">{album.title}</div>
                <div class="card-sub">{album.artist}</div>
              </div>
            {/each}
          </div>
        {/if}

        {#if searchResults.artists.length > 0 && (searchType === "all" || searchType === "artist")}
          <h3 class="header-label">Artists</h3>
          <div class="music-grid horizontal section-mb">
            {#each searchResults.artists as artist}
              <div class="music-card" on:click={() => openArtist(artist)}>
                <div class="card-img-container rounded">
                  <ImageLoader
                    src={artist.image}
                    alt={artist.name}
                    radius="50%"
                  >
                    <div slot="fallback" class="icon-fallback">
                      {@html ICONS.ARTISTS}
                    </div>
                  </ImageLoader>
                </div>
                <div class="card-title center">{artist.name}</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if viewMode === "playlist" || (viewMode === "search" && (searchType === "all" || searchType === "track"))}
      <BaseList
        itemsStore={tracksStore}
        {isLoading}
        emptyText={viewMode === "search" ? "No results" : "Playlist is empty"}
      >
        <div slot="header" class="content-padded">
          <div class="playlist-header">
            <h1 class="header-title">{activePlaylistName}</h1>
            <div class="meta-tag">
              {$tracksStore.length}{hasMore ? "+" : ""} tracks
            </div>
          </div>
        </div>

        <div slot="row" let:item let:index>
          <TrackRow
            track={item}
            {index}
            isEditable={false}
            on:play={() => handlePlay(index)}
          />
        </div>

        <div slot="footer">
          {#if hasMore && !isLoading}
            <div
              use:setupObserver
              style="height: 20px; width: 100%; margin-top: 20px;"
            ></div>
          {/if}
        </div>
      </BaseList>

      {#if showLoadMoreButton}
        <div class="floating-fab-container" transition:fly={{ y: 20 }}>
          <button class="fab-load-more" on:click={loadMoreTracks}>
            Load More
          </button>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  @import "./MusicViews.css";

  .relative-parent {
    position: relative; /* Needed for absolute positioning of FAB */
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
  .back-icon-btn,
  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-text-muted);
    width: 20px;
    height: 20px;
  }

  .back-icon-btn,
  .clear-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .back-icon-btn {
    color: var(--c-text-primary);
  }

  .back-icon-btn :global(svg),
  .search-icon :global(svg),
  .clear-btn :global(svg) {
    width: 100%;
    height: 100%;
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

  .header-label {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 16px;
    color: var(--c-text-primary);
  }

  .card-img-container.is-fav {
    background: linear-gradient(135deg, var(--c-heart), #9e1a1a);
  }

  .card-img-container.rounded {
    border-radius: 50%;
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
    width: 100%;
    height: 100%;
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

  .playlist-header {
    margin-bottom: 10px;
  }

  .section-mb {
    margin-bottom: 24px;
  }

  .card-title.center {
    text-align: center;
  }

  /* Floating Action Button for Load More */
  .floating-fab-container {
    position: absolute;
    bottom: 20px;
    left: 0;
    width: 100%;
    display: flex;
    justify-content: center;
    pointer-events: none; /* Let clicks pass through empty space */
    z-index: 100;
  }

  .fab-load-more {
    pointer-events: auto;
    background: var(--c-accent);
    color: white;
    border: none;
    padding: 10px 24px;
    border-radius: 30px;
    font-weight: 600;
    font-size: 14px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    transition: transform 0.2s;
  }

  .fab-load-more:active {
    transform: scale(0.95);
  }
</style>
