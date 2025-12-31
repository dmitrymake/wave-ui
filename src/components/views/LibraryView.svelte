<script>
  import { writable } from "svelte/store";
  import { db } from "../../lib/db";
  import {
    navigationStack,
    navigateTo,
    getTrackCoverUrl,
    getTrackThumbUrl,
  } from "../../lib/store";
  import TrackRow from "../TrackRow.svelte";
  import Skeleton from "../Skeleton.svelte";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import BaseList from "./BaseList.svelte";

  export let activeCategory = "artists";

  const itemsStore = writable([]);
  let isLoading = true;
  let searchTerm = "";

  let pressedPlayAll = false;
  let pressedAddToQueue = false;

  let headerItem = null;
  let albumTotalDuration = "";
  let albumQuality = "";
  let trackCount = 0;

  $: filteredItems = $itemsStore.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.displayName.toLowerCase().includes(term) ||
      (item.artist && item.artist.toLowerCase().includes(term))
    );
  });

  $: currentView = $navigationStack[$navigationStack.length - 1];

  $: if (activeCategory) searchTerm = "";
  $: loadContent(activeCategory, currentView);

  $: if (currentView) {
    pressedPlayAll = false;
    pressedAddToQueue = false;
  }

  async function loadContent(category, viewState) {
    if (!viewState) return;

    isLoading = true;
    headerItem = viewState.data;
    albumTotalDuration = "";
    albumQuality = "";
    trackCount = 0;

    try {
      let data = [];
      if (viewState.view === "root") {
        data =
          category === "artists" ? await db.getArtists() : await db.getAlbums();
      } else if (viewState.view === "albums_by_artist") {
        const artistName = viewState.data.name || viewState.data;
        data = await db.getArtistAlbums(artistName);
      } else if (viewState.view === "tracks_by_album") {
        const albumName = viewState.data.name || viewState.data;
        data = await db.getAlbumTracks(albumName);
      }

      const enriched = data.map((item, idx) => {
        const isString = typeof item === "string";
        const obj = isString ? { name: item } : item;

        return {
          ...obj,
          displayName: obj.name || obj.title || obj.artist || "Unknown",
          thumbFile: obj.file || null,
          _uid: (obj.file || obj.name || idx) + category + viewState.view,
        };
      });

      itemsStore.set(enriched);

      if (viewState.view === "tracks_by_album" && enriched.length > 0) {
        headerItem = enriched[0];
        trackCount = enriched.length;

        const totalSec = enriched.reduce((acc, t) => acc + (t.time || 0), 0);
        if (totalSec > 0) {
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          if (h > 0) albumTotalDuration = `${h} hr ${m} min`;
          else albumTotalDuration = `${m} min`;
        }

        if (enriched[0].qualityBadge) {
          albumQuality = enriched[0].qualityBadge;
        }
      }
    } catch (e) {
      console.error(e);
      itemsStore.set([]);
    } finally {
      isLoading = false;
    }
  }

  function handleItemClick(item) {
    if (currentView.view === "root") {
      if (activeCategory === "artists") {
        navigateTo("albums_by_artist", item);
      } else {
        navigateTo("tracks_by_album", item);
      }
    } else if (currentView.view === "albums_by_artist") {
      navigateTo("tracks_by_album", item);
    }
  }

  function handlePlayAll() {
    const items = $itemsStore;
    if (items.length > 0) {
      pressedPlayAll = true;
      MPD.playAllTracks(items);
    }
  }

  function handleAddToQueue() {
    const items = $itemsStore;
    if (items.length > 0) {
      pressedAddToQueue = true;
      MPD.addAllToQueue(items);

      setTimeout(() => {
        pressedAddToQueue = false;
      }, 2000);
    }
  }
</script>

<div
  class="view-container"
  class:scrollable={currentView?.view !== "tracks_by_album"}
>
  {#if currentView?.view === "tracks_by_album"}
    <BaseList
      {itemsStore}
      {isLoading}
      isEditMode={false}
      emptyText="No tracks found"
    >
      <div slot="header" class="content-padded">
        <div class="view-header">
          <div class="header-art">
            <ImageLoader
              src={getTrackCoverUrl(headerItem)}
              alt="Art"
              radius="12px"
            >
              <div slot="fallback" class="icon-fallback">
                {@html ICONS.ALBUMS}
              </div>
            </ImageLoader>
          </div>

          <div class="header-info">
            <div class="header-label">
              {currentView.view === "albums_by_artist" ? "Artist" : "Album"}
            </div>
            <h1 class="header-title">
              {currentView.data.name ||
                currentView.data.displayName ||
                "Unknown"}
            </h1>
            {#if currentView.data.artist}
              <h2 class="header-sub">
                {currentView.data.artist}
              </h2>
            {/if}

            <div class="meta-badges">
              {#if trackCount > 0}
                <span class="meta-tag">{trackCount} tracks</span>
              {/if}
              {#if albumTotalDuration}
                <span class="meta-tag">{albumTotalDuration}</span>
              {/if}
              {#if albumQuality}
                <span class="meta-tag quality">{albumQuality}</span>
              {/if}
            </div>

            <div class="header-actions">
              <button
                class="btn-primary"
                on:click={handlePlayAll}
                disabled={pressedPlayAll}
              >
                {pressedPlayAll ? "Playing..." : "Play All"}
              </button>

              <button
                class="btn-secondary"
                on:click={handleAddToQueue}
                disabled={pressedAddToQueue}
              >
                {pressedAddToQueue ? "Added" : "To Queue"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div slot="row" let:item let:index>
        <TrackRow
          track={item}
          {index}
          isEditable={false}
          on:play={() => MPD.playTrackOptimistic(item)}
        />
      </div>
    </BaseList>
  {:else}
    <div class="content-padded">
      <div class="search-input-container">
        <span class="search-icon">
          {@html ICONS.SEARCH}
        </span>
        <input
          type="text"
          placeholder="Filter {activeCategory}..."
          bind:value={searchTerm}
        />
      </div>

      {#if isLoading}
        <div class="music-grid">
          {#each Array(12) as _}
            <div class="music-card">
              <Skeleton
                width="100%"
                style="aspect-ratio:1; border-radius:12px; margin-bottom:12px;"
              />
              <Skeleton width="80%" height="16px" />
            </div>
          {/each}
        </div>
      {:else}
        <div class="music-grid">
          {#each filteredItems as item (item._uid)}
            <div
              class="music-card"
              on:click={() => handleItemClick(item)}
              role="button"
              tabindex="0"
              on:keypress={(e) => e.key === "Enter" && handleItemClick(item)}
            >
              <div class="card-img-container">
                <ImageLoader
                  src={getTrackThumbUrl(item, "md")}
                  alt={item.displayName}
                  radius="8px"
                >
                  <div slot="fallback" class="icon-fallback">
                    {#if activeCategory === "artists"}
                      {@html ICONS.ARTISTS}
                    {:else}
                      {@html ICONS.ALBUMS}
                    {/if}
                  </div>
                </ImageLoader>

                <div class="play-overlay">
                  <span style="width:48px; color:#fff">{@html ICONS.PLAY}</span>
                </div>
              </div>

              <div class="card-title">{item.displayName}</div>
              {#if activeCategory === "albums" && item.artist}
                <div class="card-sub">{item.artist}</div>
              {/if}
            </div>
          {:else}
            <div class="empty-text">No results found</div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  @import "./MusicViews.css";

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

  .header-sub {
    font-size: 20px;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
  }

  .search-icon {
    opacity: 0.5;
    margin-right: 12px;
    display: flex;
    width: 20px;
  }

  .empty-text {
    grid-column: 1/-1;
    text-align: center;
    padding: 40px;
    opacity: 0.5;
  }
</style>
