<script>
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { YandexApi } from "../../lib/yandex";
  import { yandexToken, showToast, yandexContext } from "../../lib/store";
  import { ICONS } from "../../lib/icons";
  import * as MPD from "../../lib/mpd";
  import { playYandexTrack } from "../../lib/mpd/index"; // Import new helper
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import Skeleton from "../Skeleton.svelte";
  import { writable } from "svelte/store";

  const tracksStore = writable([]);
  let playlists = [];
  let isLoading = false;
  let viewMode = "dashboard"; // 'dashboard' | 'playlist' | 'search'
  let activePlaylistName = "";
  let searchQuery = "";
  let searchTimer;

  $: isTokenSet = !!$yandexToken;

  onMount(() => {
    if (isTokenSet) {
      loadDashboard();
    }
  });

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
    tracksStore.set([]);

    try {
      let tracks;
      if (pl.kind === "favorites") {
        tracks = await YandexApi.getFavorites();
      } else {
        tracks = await YandexApi.getPlaylistTracks(pl.kind, pl.uid);
      }
      tracksStore.set(tracks);
    } catch (e) {
      showToast("Failed to load tracks", "error");
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

  async function performSearch() {
    isLoading = true;
    viewMode = "search";
    activePlaylistName = `Search: ${searchQuery}`;
    tracksStore.set([]);

    try {
      const tracks = await YandexApi.search(searchQuery);
      tracksStore.set(tracks);
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

  // UPDATED PLAY FUNCTION
  async function handlePlay(track, index) {
    // Set the full list context so "Next" works
    yandexContext.set({
      active: true,
      tracks: $tracksStore,
      currentIndex: index,
      currentTrackFile: null, // Will be set in playYandexTrack
    });

    playYandexTrack(track, index);
  }

  function getCover(pl) {
    if (pl.kind === "favorites") return null;
    if (pl.cover && pl.cover.uri) {
      return `https://${pl.cover.uri.replace("%%", "200x200")}`;
    }
    return null;
  }
</script>

<div class="view-container scrollable">
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

    {#if viewMode === "playlist" || viewMode === "search"}
      <BaseList
        itemsStore={tracksStore}
        {isLoading}
        emptyText={viewMode === "search"
          ? "No results found"
          : "Playlist is empty"}
      >
        <div slot="header" class="content-padded">
          <div class="playlist-header">
            <h1 class="header-title">{activePlaylistName}</h1>
            <div class="meta-tag">{$tracksStore.length} tracks</div>
          </div>
        </div>

        <div slot="row" let:item let:index>
          <TrackRow
            track={item}
            {index}
            isEditable={false}
            on:play={() => handlePlay(item, index)}
          />
        </div>
      </BaseList>
    {/if}
  {/if}
</div>

<style>
  @import "./MusicViews.css";

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
    margin-bottom: 20px;
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

  .playlist-header {
    margin-bottom: 10px;
  }
</style>
