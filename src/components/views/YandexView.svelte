<script>
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { YandexApi } from "../../lib/yandex";
  import { yandexToken, showToast } from "../../lib/store";
  import { ICONS } from "../../lib/icons";
  import * as MPD from "../../lib/mpd";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import { writable } from "svelte/store";

  const tracksStore = writable([]);
  let isLoading = false;
  let activeTab = "favorites"; // 'favorites' | 'search'
  let searchQuery = "";

  $: isTokenSet = !!$yandexToken;

  async function loadFavorites() {
    if (!isTokenSet) return;
    isLoading = true;
    activeTab = "favorites";
    const tracks = await YandexApi.getFavorites();
    tracksStore.set(tracks);
    isLoading = false;
  }

  async function handleSearch() {
    if (!searchQuery || !isTokenSet) return;
    isLoading = true;
    activeTab = "search";
    const tracks = await YandexApi.search(searchQuery);
    tracksStore.set(tracks);
    isLoading = false;
  }

  // Перехват воспроизведения: получаем ссылку и отдаем в MPD
  async function playTrack(track) {
    if (!track.id) return;

    showToast(`Resolving stream for ${track.title}...`, "info");
    const streamUrl = await YandexApi.getStreamUrl(track.id);

    if (streamUrl) {
      MPD.playUri(streamUrl, {
        title: track.title,
        artist: track.artist,
        album: track.album,
      });
    } else {
      showToast("Failed to get stream URL", "error");
    }
  }

  onMount(() => {
    if (isTokenSet) {
      loadFavorites();
    }
  });
</script>

<div class="view-container">
  {#if !isTokenSet}
    <div class="token-alert content-padded">
      <h3>Yandex Music Token Required</h3>
      <p>Please go to Settings and enter your OAuth token.</p>
    </div>
  {:else}
    <div class="content-padded no-bottom-pad">
      <div class="tabs">
        <button
          class="tab-btn"
          class:active={activeTab === "favorites"}
          on:click={loadFavorites}
        >
          Favorites
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === "search"}
          on:click={() => (activeTab = "search")}
        >
          Search
        </button>
      </div>

      {#if activeTab === "search"}
        <div class="search-input-container" in:fade>
          <span class="search-icon">{@html ICONS.SEARCH}</span>
          <input
            type="text"
            placeholder="Search Yandex Music..."
            bind:value={searchQuery}
            on:change={handleSearch}
            on:keydown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
      {/if}
    </div>

    <BaseList
      itemsStore={tracksStore}
      {isLoading}
      emptyText={activeTab === "favorites"
        ? "No favorites found"
        : "Start searching..."}
    >
      <div slot="header" class="content-padded">
        <h1 class="header-title">
          {activeTab === "favorites" ? "My Favorites" : "Search Results"}
        </h1>
      </div>

      <div slot="row" let:item let:index>
        <TrackRow
          track={item}
          {index}
          isEditable={false}
          on:play={() => playTrack(item)}
        />
      </div>
    </BaseList>
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

  .tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
  }

  .tab-btn {
    padding: 8px 16px;
    background: var(--c-surface-button);
    border: 1px solid var(--c-border);
    color: var(--c-text-secondary);
    border-radius: 20px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn.active {
    background: var(--c-accent);
    color: var(--c-text-primary);
    border-color: var(--c-accent);
  }

  .search-input-container {
    display: flex;
    align-items: center;
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
  }

  .search-icon {
    width: 18px;
    height: 18px;
    margin-right: 10px;
    color: var(--c-text-muted);
  }

  input {
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    width: 100%;
    outline: none;
  }
</style>
