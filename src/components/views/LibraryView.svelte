<script>
  import { writable } from "svelte/store";
  import { fade, scale } from "svelte/transition";
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

  // Sorting State
  let sortOption = "name";
  let isSortMenuOpen = false;

  const SORT_OPTIONS = [
    { id: "name", label: "A-Z" },
    { id: "artist", label: "Artist" },
    { id: "year", label: "Oldest" },
    { id: "year_desc", label: "Newest" },
  ];

  let pressedPlayAll = false;
  let pressedAddToQueue = false;

  let headerItem = null;
  let albumTotalDuration = "";
  let albumQuality = "";
  let trackCount = 0;
  let albumYear = "";

  // Icon computation
  $: currentSortIcon =
    sortOption === "year_desc" ? ICONS.SORT_ASC : ICONS.SORT_DESC;

  $: filteredItems = sortItems(
    $itemsStore.filter((item) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.displayName.toLowerCase().includes(term) ||
        (item.artist && item.artist.toLowerCase().includes(term))
      );
    }),
    sortOption,
  );

  $: currentView = $navigationStack[$navigationStack.length - 1];

  $: if (activeCategory) {
    searchTerm = "";
    if (activeCategory === "albums") sortOption = "name";
    else sortOption = "name";
  }

  $: loadContent(activeCategory, currentView);

  $: if (currentView) {
    pressedPlayAll = false;
    pressedAddToQueue = false;
    isSortMenuOpen = false;
  }

  function toggleSortMenu() {
    isSortMenuOpen = !isSortMenuOpen;
  }

  function selectSort(optionId) {
    sortOption = optionId;
    isSortMenuOpen = false;
  }

  function sortItems(items, option) {
    if (!items || items.length === 0) return [];

    const sorted = [...items].sort((a, b) => {
      switch (option) {
        case "name":
          return a.displayName.localeCompare(b.displayName, undefined, {
            sensitivity: "base",
          });

        case "artist":
          const artA = a.artist || "";
          const artB = b.artist || "";
          const cmp = artA.localeCompare(artB, undefined, {
            sensitivity: "base",
          });
          if (cmp !== 0) return cmp;
          return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);

        case "year":
          return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);

        case "year_desc":
          return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);

        default:
          return 0;
      }
    });

    if (option === "artist") {
      const grouped = [];
      let lastArtist = null;

      sorted.forEach((item) => {
        const currentArtist = item.artist || "Unknown Artist";
        if (currentArtist !== lastArtist) {
          grouped.push({
            _uid: `header-${currentArtist}`,
            isHeader: true,
            title: currentArtist,
          });
          lastArtist = currentArtist;
        }
        grouped.push(item);
      });
      return grouped;
    }

    return sorted;
  }

  async function loadContent(category, viewState) {
    if (!viewState) return;

    isLoading = true;
    headerItem = viewState.data;
    albumTotalDuration = "";
    albumQuality = "";
    albumYear = "";
    trackCount = 0;

    try {
      let data = [];
      if (viewState.view === "root") {
        data =
          category === "artists" ? await db.getArtists() : await db.getAlbums();
      } else if (viewState.view === "albums_by_artist") {
        const artistName = viewState.data.name || viewState.data;
        data = await db.getArtistAlbums(artistName);
        sortOption = "year";
      } else if (viewState.view === "tracks_by_album") {
        const albumName = viewState.data.name || viewState.data;
        data = await db.getAlbumTracks(albumName);
      }

      const enriched = data.map((item, idx) => {
        const isString = typeof item === "string";
        const obj = isString ? { name: item } : item;

        let yStr = String(obj.year || "");
        if (yStr.length > 4) yStr = yStr.substring(0, 4);

        return {
          ...obj,
          displayName: obj.name || obj.title || obj.artist || "Unknown",
          thumbFile: obj.file || null,
          year: yStr,
          _uid: (obj.file || obj.name || idx) + category + viewState.view,
        };
      });

      itemsStore.set(enriched);

      if (viewState.view === "tracks_by_album" && enriched.length > 0) {
        headerItem = enriched[0];
        trackCount = enriched.length;
        albumYear = enriched[0].year;

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

            {#if headerItem && headerItem.artist}
              <div class="artist-row-header">
                <h2 class="header-sub">
                  {headerItem.artist}
                </h2>
                {#if albumYear && albumYear !== "0"}
                  <span class="year-badge-header">{albumYear}</span>
                {/if}
              </div>
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

        {#if activeCategory === "albums" || currentView.view === "albums_by_artist"}
          <div class="sort-wrapper">
            <button class="sort-trigger" on:click={toggleSortMenu}>
              <span>{SORT_OPTIONS.find((o) => o.id === sortOption)?.label}</span
              >
              <span class="sort-trigger-icon">{@html currentSortIcon}</span>
            </button>

            {#if isSortMenuOpen}
              <div
                class="sort-backdrop"
                on:click={toggleSortMenu}
                transition:fade={{ duration: 100 }}
              ></div>
              <div
                class="sort-menu"
                transition:scale={{ start: 0.95, duration: 100 }}
              >
                {#each SORT_OPTIONS as opt}
                  <button
                    class="sort-item"
                    class:selected={sortOption === opt.id}
                    on:click={() => selectSort(opt.id)}
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
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
            {#if item.isHeader}
              <div class="group-header header-label">
                {item.title}
              </div>
            {:else}
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
                    <span style="width:48px; color:#fff"
                      >{@html ICONS.PLAY}</span
                    >
                  </div>
                </div>

                <div class="card-title">{item.displayName}</div>
                <div class="card-sub-row">
                  {#if item.artist}
                    <div class="card-sub text-ellipsis">{item.artist}</div>
                  {/if}

                  {#if item.year && item.year !== "0"}
                    <div class="card-year">{item.year}</div>
                  {/if}

                  {#if item.qualityBadge}
                    <div class="card-year quality">
                      {item.qualityBadge.split(" ")[0]}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
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
  @import "../../styles/SortMenu.css";

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

  .artist-row-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 12px 0;
  }

  .header-sub {
    font-size: 20px;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
  }

  .header-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--c-accent);
    margin-bottom: 4px;
  }

  .group-header {
    grid-column: 1 / -1;
    width: 100%;
    display: flex;
    align-items: center;
  }

  .year-badge-header {
    font-size: 13px;
    font-weight: 700;
    color: var(--c-text-muted);
    background: rgba(255, 255, 255, 0.1);
    padding: 3px 7px;
    border-radius: 4px;
    line-height: 1;
  }

  .meta-badges {
    display: flex;
    gap: 8px;
    margin: 0 0 24px;
  }

  .meta-tag {
    font-size: 12px;
    font-weight: 600;
    color: var(--c-text-secondary);
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 8px;
    border-radius: 4px;
  }

  .meta-tag.quality {
    color: var(--c-text-primary);
    border: 1px solid var(--c-border);
    background: transparent;
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

  .card-sub-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    font-size: 13px;
    color: var(--c-text-secondary);
    margin-top: 2px;
    min-width: 0;
  }

  .card-sub {
    flex-shrink: 1;
  }

  .card-year {
    font-size: 10px;
    font-weight: 700;
    color: var(--c-text-muted);
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    line-height: 1;
  }

  .card-year.quality {
    color: var(--c-text-secondary);
    border: 1px solid var(--c-border);
    background: transparent;
  }

  .search-input-container {
    display: flex;
    align-items: center;
    background: var(--c-surface-input);
    border-radius: 8px;
    padding: 0 12px 0 16px;
    height: 48px;
    margin-bottom: 24px;
    border: 1px solid var(--c-border);
  }

  .search-input-container input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    font-size: 16px;
    outline: none;
    min-width: 0;
  }
</style>
