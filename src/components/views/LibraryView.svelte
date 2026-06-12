<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { writable } from "svelte/store";
  import type { Writable } from "svelte/store";
  import { sortItems } from "../../lib/librarySort";
  import { loadLibraryView } from "../../lib/libraryData";
  import { logger } from "../../lib/logger";
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

  const itemsStore = writable<LibraryItem[]>([]);
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

  let headerItem = $state<Track | null>(null);
  let headerTotalDuration = $state("");
  let headerQuality = $state("");
  let headerSubtitle = $state("");
  let trackCount = $state(0);

  // Cancels a slower in-flight load when a newer one starts.
  let loadAbort: AbortController | null = null;

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

  let currentViewData = $derived(
    (currentView?.data ?? {}) as { name?: string; displayName?: string },
  );

  $effect(() => {
    if (activeCategory) {
      searchTerm = "";
      sortOption = "name";
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

  async function loadContent(category: string, viewState: NavigationEntry | undefined) {
    if (!viewState) return;

    loadAbort?.abort();
    const ctrl = new AbortController();
    loadAbort = ctrl;

    isLoading = true;
    itemsStore.set([]);
    headerItem = (viewState.data ?? null) as Track | null;
    headerTotalDuration = "";
    headerQuality = "";
    headerSubtitle = "";
    trackCount = 0;

    if (viewState.view === "albums_by_artist") sortOption = "year";

    try {
      const { items, header } = await loadLibraryView(category, viewState);
      if (ctrl.signal.aborted) return;

      itemsStore.set(items);
      if (header.headerItem) headerItem = header.headerItem as unknown as Track;
      trackCount = header.trackCount;
      headerTotalDuration = header.totalDuration;
      headerQuality = header.quality;
      headerSubtitle = header.subtitle;
    } catch (e) {
      if (!ctrl.signal.aborted) {
        logger.error(e);
        itemsStore.set([]);
      }
    } finally {
      if (!ctrl.signal.aborted) isLoading = false;
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
      const data = (currentView.data ?? {}) as { name?: string; displayName?: string };
      const targetName =
        data.name ||
        data.displayName ||
        "this selection";

      showModal({
        title: "Replace Queue?",
        message: `This will clear your queue and play all tracks from "${targetName}".`,
        confirmLabel: "Play",
        type: "confirm",
        onConfirm: () => {
          pressedPlayAll = true;
          MPD.playAllTracks(items as unknown as Track[]);
        },
      });
    }
  }

  function handleAddToQueue() {
    const items = $itemsStore;
    if (items.length > 0) {
      pressedAddToQueue = true;
      MPD.addAllToQueue(items as unknown as Track[]);

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
      itemsStore={itemsStore as unknown as Writable<Track[]>}
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
                  title={currentViewData.name || currentViewData.displayName}
                >
                  {currentViewData.name ||
                    currentViewData.displayName ||
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
                onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleItemClick(item); } }}
              >
                <div class="card-img-container">
                  <ImageLoader
                    src={getTrackThumbUrl(item as unknown as Track, "md")}
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
