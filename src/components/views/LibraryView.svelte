<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { writable } from "svelte/store";
  import { db } from "../../lib/db";
  import {
    navigationStack,
    navigateTo,
    getTrackCoverUrl,
    getTrackThumbUrl,
    showModal,
  } from "../../lib/store";
  import TrackRow from "../TrackRow.svelte";
  import Skeleton from "../Skeleton.svelte";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import BaseList from "./BaseList.svelte";
  import type { Track, NavigationEntry, LibraryItem } from "../../lib/types";

  let { activeCategory = "artists" }: { activeCategory?: string } = $props();

  const itemsStore = writable([]);
  let isLoading = $state(true);
  let searchTerm = $state("");

  // Sorting State
  let sortOption = $state("name");
  let isSortMenuOpen = $state(false);

  const SORT_OPTIONS = [
    { id: "name", label: "A-Z" },
    { id: "artist", label: "Artist" },
    { id: "year", label: "Oldest" },
    { id: "year_desc", label: "Newest" },
  ];

  let pressedPlayAll = $state(false);
  let pressedAddToQueue = $state(false);

  let headerItem = $state(null);
  let headerTotalDuration = $state("");
  let headerQuality = $state("");
  let headerSubtitle = $state("");
  let trackCount = $state(0);

  // Race condition protection
  let lastRequestId = 0;

  let currentSortIcon = $derived(
    sortOption === "year_desc" ? ICONS.SORT_ASC : ICONS.SORT_DESC);

  let filteredItems = $derived(sortItems(
    $itemsStore.filter((item) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.displayName.toLowerCase().includes(term) ||
        (item.artist && item.artist.toLowerCase().includes(term))
      );
    }),
    sortOption,
  ));

  let currentView = $derived($navigationStack[$navigationStack.length - 1]);

  $effect(() => {
    if (activeCategory) {
      searchTerm = "";
      if (activeCategory === "albums") sortOption = "name";
      else sortOption = "name";
    }
  });

  $effect(() => {
    loadContent(activeCategory, currentView);
  });

  $effect(() => {
    if (currentView) {
      pressedPlayAll = false;
      pressedAddToQueue = false;
      isSortMenuOpen = false;
    }
  });

  function toggleSortMenu() {
    isSortMenuOpen = !isSortMenuOpen;
  }

  function selectSort(optionId: string) {
    sortOption = optionId;
    isSortMenuOpen = false;
  }

  function sortItems(items: LibraryItem[], option: string): LibraryItem[] {
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

  async function loadContent(category: string, viewState: NavigationEntry | undefined) {
    if (!viewState) return;

    const requestId = ++lastRequestId;

    isLoading = true;
    itemsStore.set([]);

    headerItem = viewState.data;
    headerTotalDuration = "";
    headerQuality = "";
    headerSubtitle = "";
    trackCount = 0;

    console.log(`[LibraryView #${requestId}] Start loading:`, viewState);

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
        const artistName = viewState.data.artist;
        data = await db.getAlbumTracks(albumName, artistName);
      }

      if (requestId !== lastRequestId) {
        console.warn(`[LibraryView #${requestId}] Request cancelled (stale).`);
        return;
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

      console.log(
        `[LibraryView #${requestId}] Setting ${enriched.length} items.`,
      );
      itemsStore.set(enriched);

      if (viewState.view === "tracks_by_album" && enriched.length > 0) {
        headerItem = enriched[0];
        trackCount = enriched.length;
        headerSubtitle = enriched[0].year;

        const totalSec = enriched.reduce((acc, t) => acc + (t.time || 0), 0);
        if (totalSec > 0) {
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          headerTotalDuration = h > 0 ? `${h} hr ${m} min` : `${m} min`;
        }

        if (enriched[0].qualityBadge) {
          headerQuality = enriched[0].qualityBadge;
        }
      }
    } catch (e) {
      if (requestId === lastRequestId) {
        console.error(e);
        itemsStore.set([]);
      }
    } finally {
      if (requestId === lastRequestId) {
        isLoading = false;
      }
    }
  }

  function handleItemClick(item: LibraryItem) {
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
      const targetName =
        currentView.data.name ||
        currentView.data.displayName ||
        "this selection";

      showModal({
        title: "Replace Queue?",
        message: `This will clear your queue and play all tracks from "${targetName}".`,
        confirmLabel: "Play",
        type: "confirm",
        onConfirm: () => {
          pressedPlayAll = true;
          MPD.playAllTracks(items);
        },
      });
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
      {#snippet header()}
        <div class="content-padded">
          <div class="view-header">
            <div class="header-art">
              <div style="width: 100%; height: 100%;">
                <ImageLoader
                  src={getTrackCoverUrl(headerItem)}
                  alt="Art"
                  radius="8px"
                >
                  {#snippet fallback()}
                    <div class="icon-fallback">
                      {@html ICONS.ALBUMS}
                    </div>
                  {/snippet}
                </ImageLoader>
              </div>
            </div>

            <div class="header-info">
              <div class="header-text-group">
                <div class="header-label">
                  {currentView.view === "albums_by_artist" ? "Artist" : "Album"}
                </div>
                <h1
                  class="header-title"
                  title={currentView.data.name || currentView.data.displayName}
                >
                  {currentView.data.name ||
                    currentView.data.displayName ||
                    "Unknown"}
                </h1>

                {#if headerItem && headerItem.artist}
                  <div class="header-subtitle-row">
                    <h2 class="header-sub-text">
                      {headerItem.artist}
                    </h2>
                    {#if headerSubtitle && headerSubtitle !== "0"}
                      <span class="meta-tag">{headerSubtitle}</span>
                    {/if}
                  </div>
                {/if}

                <div class="meta-badges">
                  {#if trackCount > 0}
                    <span class="meta-tag">{trackCount} tracks</span>
                  {/if}
                  {#if headerTotalDuration}
                    <span class="meta-tag">{headerTotalDuration}</span>
                  {/if}
                  {#if headerQuality}
                    <span class="meta-tag quality">{headerQuality}</span>
                  {/if}
                </div>
              </div>

              <div class="header-actions">
                <button
                  class="btn-primary"
                  onclick={handlePlayAll}
                  disabled={pressedPlayAll}
                >
                  {pressedPlayAll ? "Playing..." : "Play All"}
                </button>

                <button
                  class="btn-secondary"
                  onclick={handleAddToQueue}
                  disabled={pressedAddToQueue}
                >
                  {pressedAddToQueue ? "Added" : "To Queue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      {/snippet}

      {#snippet row({ item, index })}
        <TrackRow
          track={item}
          {index}
          isEditable={false}
          onplay={() => MPD.playTrackOptimistic(item)}
        />
      {/snippet}
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
            <button class="sort-trigger" onclick={toggleSortMenu}>
              <span>{SORT_OPTIONS.find((o) => o.id === sortOption)?.label}</span
              >
              <span class="sort-trigger-icon">{@html currentSortIcon}</span>
            </button>

            {#if isSortMenuOpen}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="sort-backdrop"
                onclick={toggleSortMenu}
                role="presentation"
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
                    onclick={() => selectSort(opt.id)}
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
            <div class="music-card skeleton-card">
              <div class="card-img-container">
                <Skeleton width="100%" height="100%" radius="8px" />
              </div>
              <div style="margin-top: 12px; margin-bottom: 4px;">
                <Skeleton width="80%" height="15px" radius="4px" />
              </div>
              <div>
                <Skeleton
                  width="50%"
                  height="13px"
                  radius="4px"
                  style="opacity: 0.6"
                />
              </div>
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
                onclick={() => handleItemClick(item)}
                role="button"
                tabindex="0"
                onkeypress={(e) => e.key === "Enter" && handleItemClick(item)}
              >
                <div class="card-img-container">
                  <ImageLoader
                    src={getTrackThumbUrl(item, "md")}
                    alt={item.displayName}
                    radius="8px"
                  >
                    {#snippet fallback()}
                      <div class="icon-fallback">
                        {#if activeCategory === "artists"}
                          {@html ICONS.ARTISTS}
                        {:else}
                          {@html ICONS.ALBUMS}
                        {/if}
                      </div>
                    {/snippet}
                  </ImageLoader>

                  <div class="play-overlay">
                    <span class="overlay-icon">{@html ICONS.PLAY}</span>
                  </div>
                </div>

                <div class="card-title">{item.displayName}</div>
                <div class="card-sub-row">
                  {#if item.artist}
                    <div class="card-sub text-ellipsis">{item.artist}</div>
                  {/if}

                  {#if item.year && item.year !== "0"}
                    <div class="card-badge">{item.year}</div>
                  {/if}

                  {#if item.qualityBadge}
                    <div class="card-badge quality">
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

  @import "../../styles/SortMenu.css";

  .music-card.skeleton-card .card-img-container {
    aspect-ratio: 1;
    background: transparent;
    margin-bottom: 0;
  }
  .music-card.skeleton-card:hover {
    background: transparent;
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
  }

  .icon-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    color: var(--c-icon-faint);
    background: var(--c-bg-placeholder);
  }
  .icon-fallback :global(svg) {
    width: 40px;
    height: 40px;
    opacity: 0.5;
  }

  .group-header {
    grid-column: 1 / -1;
    width: 100%;
    display: flex;
    align-items: center;
  }

  .empty-text {
    grid-column: 1/-1;
    text-align: center;
    padding: 40px;
    opacity: 0.5;
  }
</style>
