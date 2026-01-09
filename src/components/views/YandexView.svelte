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

  // Хлебные крошки и заголовок
  let activeTitle = "";
  let activeSubtitle = "";

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
      const userPls = await YandexApi.getUserPlaylists();

      playlists = [
        {
          title: "My Vibe",
          kind: "my_vibe",
          cover: null,
          isStation: true,
        },
        ...userPls,
      ];
    } catch (e) {
      console.error(e);
      showToast("Failed to load playlists", "error");
    } finally {
      isLoading = false;
    }
  }

  async function openPlaylist(pl) {
    if (pl.kind === "my_vibe") {
      showToast("Starting My Vibe...", "info");
      try {
        await YandexApi.playRadio();
      } catch (e) {
        showToast("Failed to start radio", "error");
      }
      return;
    }

    viewMode = "list";
    activeTitle = pl.title;
    activeSubtitle = pl.trackCount + " tracks";
    tracksStore.set([]);
    isLoading = true;

    try {
      const res = await YandexApi.getPlaylistTracks(pl.uid, pl.kind);
      if (res && res.tracks) {
        tracksStore.set(res.tracks);
      }
    } catch (e) {
      showToast("Failed to load tracks", "error");
    } finally {
      isLoading = false;
    }
  }

  async function openAlbum(album) {
    viewMode = "list";
    activeTitle = album.title;
    activeSubtitle = album.artist;
    tracksStore.set([]);
    isLoading = true;

    try {
      const res = await YandexApi.request("get_album_tracks", { id: album.id });
      if (res && res.tracks) {
        tracksStore.set(res.tracks);
      }
    } catch (e) {
      showToast("Failed to load album", "error");
    } finally {
      isLoading = false;
    }
  }

  async function openArtist(artist) {
    viewMode = "list";
    activeTitle = artist.title;
    activeSubtitle = "Popular Tracks";
    tracksStore.set([]);
    isLoading = true;

    try {
      const res = await YandexApi.request("get_artist_tracks", {
        id: artist.id,
      });
      if (res && res.tracks) {
        tracksStore.set(res.tracks);
      }
    } catch (e) {
      showToast("Failed to load artist", "error");
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
      const res = await YandexApi.search(searchQuery);
      if (res) {
        searchResults = res;
        if (searchType === "track" || searchType === "all") {
          tracksStore.set(res.tracks || []);
        }
      }
    } catch (e) {
      console.error(e);
      showToast("Search failed", "error");
    } finally {
      isLoading = false;
    }
  }

  function goBack() {
    if (viewMode === "list") {
      if (searchQuery.length > 0) viewMode = "search";
      else viewMode = "dashboard";
    } else {
      viewMode = "dashboard";
      searchQuery = "";
      tracksStore.set([]);
    }
  }

  async function handlePlayTrack(track) {
    if (track.id) {
      showToast(`Playing ${track.title}...`, "info");
      try {
        await YandexApi.playTrack(track.id);
      } catch (e) {
        console.error(e);
        showToast("Error playing track", "error");
      }
    }
  }

  async function handlePlayAll() {
    const tracks = $tracksStore;
    if (tracks.length === 0) return;

    isLoading = true;
    try {
      const res = await fetch(
        window.location.origin + "/wave-yandex-api.php?action=play_playlist",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tracks: tracks }),
        },
      );

      if (!res.ok) throw new Error("Server error");

      showToast(`Started playing ${tracks.length} tracks`, "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to start playlist", "error");
    } finally {
      isLoading = false;
    }
  }

  async function handleAddToQueue() {
    const tracks = $tracksStore;
    for (const t of tracks) {
      await YandexApi.request("play_track", { id: t.id, append: "1" });
    }
    showToast(`Added ${tracks.length} tracks to queue`, "success");
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
          <button
            class="clear-btn"
            on:click={() => {
              searchQuery = "";
              viewMode = "dashboard";
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
                  class:is-vibe={pl.kind === "my_vibe"}
                >
                  {#if pl.kind === "my_vibe"}
                    <div class="icon-wrap">{@html ICONS.RADIO}</div>
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
                {#if pl.trackCount}<div class="card-sub">
                    {pl.trackCount} tracks
                  </div>{/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if viewMode === "search"}
      <div class="content-padded">
        {#if searchResults.artists && searchResults.artists.length > 0 && searchType === "all"}
          <h3 class="header-label">Artists</h3>
          <div class="music-grid horizontal section-mb">
            {#each searchResults.artists as artist}
              <div class="music-card" on:click={() => openArtist(artist)}>
                <div class="card-img-container rounded">
                  <ImageLoader
                    src={artist.image}
                    alt={artist.title}
                    radius="50%"
                  >
                    <div slot="fallback" class="icon-fallback">
                      {@html ICONS.ARTISTS}
                    </div>
                  </ImageLoader>
                </div>
                <div class="card-title center">{artist.title}</div>
              </div>
            {/each}
          </div>
        {/if}

        {#if searchResults.albums && searchResults.albums.length > 0 && searchType === "all"}
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
      </div>
    {/if}

    {#if viewMode === "list" && $tracksStore.length > 0}
      <div
        class="header-actions"
        style="display:flex; gap:10px; padding: 10px 16px;"
      >
        <button class="btn-primary" on:click={handlePlayAll}>Play All</button>
        <button class="btn-secondary" on:click={handleAddToQueue}
          >Add to Queue</button
        >
      </div>
    {/if}

    <BaseList
      itemsStore={tracksStore}
      {isLoading}
      emptyText={viewMode === "search" ? "No results" : "Playlist is empty"}
    >
      <div slot="header" class="content-padded">
        {#if viewMode === "list"}
          <div class="playlist-header">
            <h1>{activeTitle}</h1>
            <div class="card-sub">{activeSubtitle}</div>
          </div>
        {/if}
      </div>
      <div slot="row" let:item let:index>
        <TrackRow
          track={item}
          {index}
          isEditable={false}
          on:play={() => handlePlayTrack(item)}
        />
      </div>
    </BaseList>
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

  .playlist-header h1 {
    margin: 0;
    font-size: 24px;
    color: var(--c-text-primary);
  }

  .card-img-container.is-vibe {
    background: linear-gradient(135deg, #a4508b, #5f0a87);
  }
  .card-img-container.rounded {
    border-radius: 50%;
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
