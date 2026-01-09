<script>
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { YandexApi } from "../../lib/yandex";
  import { yandexAuthStatus, showToast } from "../../lib/store";
  import { ICONS } from "../../lib/icons";
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

  let searchQuery = "";
  let searchType = "all";
  let searchResults = { tracks: [], albums: [], artists: [] };
  let searchTimer;

  $: isTokenSet = $yandexAuthStatus;

  onMount(() => {
    if (isTokenSet) {
      loadDashboard();
    }
  });

  async function loadDashboard() {
    isLoading = true;
    try {
      playlists = [{ kind: "favorites", title: "My Vibe", isStation: true }];
    } finally {
      isLoading = false;
    }
  }

  async function openPlaylist(pl) {
    if (pl.isStation) {
      showToast("Starting My Vibe...", "info");
      try {
        await YandexApi.playRadio("user:onetwo");
      } catch (e) {
        showToast("Failed to start radio", "error");
      }
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
      const res = await YandexApi.search(searchQuery);
      searchResults = res;
      if (searchType === "track" || searchType === "all") {
        tracksStore.set(res.tracks || []);
      } else {
        tracksStore.set([]);
      }
    } catch (e) {
      showToast("Search failed", "error");
    } finally {
      isLoading = false;
    }
  }

  function goBack() {
    viewMode = "dashboard";
    searchQuery = "";
    tracksStore.set([]);
  }

  async function handlePlay(track) {
    if (track.id) {
      // ИСПРАВЛЕНО: Теперь вызываем через API, а не через удаленную функцию MPD
      showToast("Starting radio based on track...", "info");
      try {
        await YandexApi.playRadio(track.id);
      } catch (e) {
        showToast("Error starting radio", "error");
      }
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
                <div class="card-img-container is-fav">
                  <div class="icon-wrap">{@html ICONS.RADIO}</div>
                  <div class="play-overlay">
                    <span class="overlay-icon">{@html ICONS.PLAY}</span>
                  </div>
                </div>
                <div class="card-title">{pl.title}</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if viewMode === "search"}
      <div class="content-padded">
        {#if searchResults.albums && searchResults.albums.length > 0 && searchType === "all"}
          <h3 class="header-label">Albums</h3>
          <div class="music-grid horizontal section-mb">
            {#each searchResults.albums as album}
              <div class="music-card">
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
      </div>
    {/if}

    {#if viewMode === "playlist" || (viewMode === "search" && (searchType === "all" || searchType === "track"))}
      <BaseList
        itemsStore={tracksStore}
        {isLoading}
        emptyText={viewMode === "search" ? "No results" : "Playlist is empty"}
      >
        <div slot="row" let:item let:index>
          <TrackRow
            track={item}
            {index}
            isEditable={false}
            on:play={() => handlePlay(item)}
          />
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

  .section-mb {
    margin-bottom: 24px;
  }
</style>
