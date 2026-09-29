<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { MOTION, EASE_EMPHASIZED } from "../../lib/transitions";
  import SkeletonGrid from "../SkeletonGrid.svelte";
  import { writable } from "svelte/store";
  import { sortItems } from "../../lib/librarySort";
  import { loadLibraryView } from "../../lib/libraryData";
  import { libraryItemToTrack } from "../../lib/trackMapper";
  import { formatQuality, summarizeQuality, HI_RES_LABEL } from "../../lib/quality";
  import { countLabel, ELLIPSIS } from "../../lib/format";
  import { libraryRevision } from "../../lib/db";
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
  import { playAllTracks, addAllToQueue, playTrackOptimistic } from "../../lib/playerActions";
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import MediaCard from "../MediaCard.svelte";
  import BaseList from "./BaseList.svelte";
  import Button from "../ui/Button.svelte";
  import type { Track, NavigationEntry, LibraryItem } from "../../lib/types";

  let { activeCategory = "artists" }: { activeCategory?: string } = $props();

  const itemsStore = writable<LibraryItem[]>([]);
  let isLoading = $state(true);
  let searchTerm = $state("");

  // Sorting State
  let sortOption = $state("name");
  let isSortMenuOpen = $state(false);

  // "A–Z" is a range, so an en dash — and the trigger is nowrap, since the
  // hyphenated "A-Z" used to break at the hyphen into "A-" over "Z".
  const SORT_OPTIONS = [
    { id: "name", label: "A–Z" },
    { id: "artist", label: "Artist" },
    { id: "year", label: "Oldest" },
    { id: "year_desc", label: "Newest" },
  ];

  let pressedPlayAll = $state(false);
  let pressedAddToQueue = $state(false);

  let headerItem = $state<Track | null>(null);
  let headerTotalDuration = $state("");
  let headerSubtitle = $state("");
  let trackCount = $state(0);

  // Cancels a slower in-flight load when a newer one starts.
  let loadAbort: AbortController | null = null;

  let currentSortIcon = $derived(
    sortOption === "year_desc" ? ICONS.SORT_DESC : ICONS.SORT_ASC);

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

  // ---- Display (presentation only) ----
  // The album's quality, read off every track at display time (the stored tag is
  // moOde's raw "FLAC 24/192 h 2"): one full label when they agree, the shared
  // codec when only resolutions differ, "Mixed" otherwise.
  let albumQuality = $derived(
    currentView?.view === "tracks_by_album"
      ? summarizeQuality($itemsStore.map((i) => i.qualityBadge))
      : null,
  );
  let headerYear = $derived(headerSubtitle && headerSubtitle !== "0" ? headerSubtitle : "");
  // On an artist's page every card is by that artist, so the cards drop the
  // artist line and say year · format instead.
  let isArtistPage = $derived(currentView?.view === "albums_by_artist");
  let filterNoun = $derived(isArtistPage ? "albums" : activeCategory);

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
    // Re-read on a libraryRevision bump too, not just on navigation, so a resync
    // that completes while this view is already mounted (e.g. after the v4
    // migration cleared the store) repopulates it instead of leaving it blank.
    void $libraryRevision;
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
    headerSubtitle = "";
    trackCount = 0;

    if (viewState.view === "albums_by_artist") sortOption = "year";

    try {
      const { items, header } = await loadLibraryView(category, viewState);
      if (ctrl.signal.aborted) return;

      itemsStore.set(items);
      if (header.headerItem) headerItem = libraryItemToTrack(header.headerItem);
      trackCount = header.trackCount;
      headerTotalDuration = header.totalDuration;
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
        message: `This will clear your queue and play all tracks from “${targetName}”.`,
        confirmLabel: "Play",
        type: "confirm",
        onConfirm: async () => {
          // The flag used to be cleared only when the view changed, so the
          // button stayed "Playing..." + disabled after the action finished.
          pressedPlayAll = true;
          try {
            await playAllTracks(items.map(libraryItemToTrack));
          } finally {
            pressedPlayAll = false;
          }
        },
      });
    }
  }

  function handleAddToQueue() {
    const items = $itemsStore;
    if (items.length === 0 || pressedAddToQueue) return;
    pressedAddToQueue = true;
    void addAllToQueue(items.map(libraryItemToTrack))
      .catch(() => {})
      .finally(() => {
        pressedAddToQueue = false;
      });
  }
</script>

<div
  class="view-container"
  class:scrollable={currentView?.view !== "tracks_by_album"}
>
  {#if currentView?.view === "tracks_by_album"}
    <BaseList
      itemsStore={itemsStore}
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
                    <h2 class="header-sub-text" title={headerItem.artist}>
                      {headerItem.artist}
                    </h2>
                  </div>
                {/if}

                <!-- One line of facts, one badge for the quality: "1986 · 2 tracks ·
                     7 min [MP3]". The year used to be a chip beside the artist and
                     every count a chip of its own. -->
                <p class="meta-line">
                  <span class="meta-text">
                    {#if headerYear}<span class="meta-item">{headerYear}</span>{/if}
                    {#if trackCount > 0}<span class="meta-item">{countLabel(trackCount, "track")}</span>{/if}
                    {#if headerTotalDuration}<span class="meta-item">{headerTotalDuration}</span>{/if}
                  </span>
                  {#if albumQuality}
                    <span class="badge">
                      {#if albumQuality.hiRes}<span class="badge__lead">{HI_RES_LABEL}</span>{/if}
                      {albumQuality.label}
                    </span>
                  {/if}
                </p>
              </div>

              <div class="header-actions">
                <Button
                  variant="primary"
                  onclick={handlePlayAll}
                  disabled={pressedPlayAll}
                >
                  {pressedPlayAll ? `Playing${ELLIPSIS}` : "Play All"}
                </Button>

                <Button
                  variant="secondary"
                  onclick={handleAddToQueue}
                  disabled={pressedAddToQueue}
                >
                  {pressedAddToQueue ? "Added" : "To Queue"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      {/snippet}

      {#snippet row({ item, index })}
        {@const track = libraryItemToTrack(item)}
        <TrackRow
          {track}
          {index}
          isEditable={false}
          onplay={() => playTrackOptimistic(track)}
        />
      {/snippet}
    </BaseList>
  {:else}
    <div class="content-padded">
      {#if isArtistPage}
        <!-- The artist's own page used to open on "Back" and a filter field:
             nothing on it said whose albums these were. Same eyebrow → title →
             meta stack as an album header, without the artwork (the library has
             no artist pictures). -->
        <header class="page-heading">
          <div class="header-label">Artist</div>
          <h1 class="header-title" title={currentViewData.name || currentViewData.displayName}>
            {currentViewData.name || currentViewData.displayName || "Unknown"}
          </h1>
          {#if !isLoading}
            <p class="meta-line">
              <span class="meta-text">
                <span class="meta-item">{countLabel($itemsStore.filter((i) => !i.isHeader).length, "album")}</span>
              </span>
            </p>
          {/if}
        </header>
      {/if}

      <div class="search-input-container">
        <span class="search-icon">
          {@html ICONS.SEARCH}
        </span>
        <input
          type="text"
          placeholder="Filter {filterNoun}{ELLIPSIS}"
          aria-label="Filter {filterNoun}"
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
                transition:fade={{ duration: MOTION.fast }}
              ></div>
              <div
                class="sort-menu"
                in:scale={{ start: 0.96, duration: MOTION.fast, easing: EASE_EMPHASIZED }}
                out:fade={{ duration: MOTION.instant }}
              >
                {#each SORT_OPTIONS as opt}
                  <button
                    class="sort-item"
                    class:selected={sortOption === opt.id}
                    aria-pressed={sortOption === opt.id}
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
        <SkeletonGrid count={12} />
      {:else}
        <div class="music-grid">
          {#each filteredItems as item (item._uid)}
            {#if item.isHeader}
              <div class="group-header header-label">
                {item.title}
              </div>
            {:else}
              {@const year = item.year && item.year !== "0" ? item.year : ""}
              {@const format = formatQuality(item.qualityBadge, "short")}
              <!-- Artist on its own line (it was squeezed to "George Mic…" by two
                   chips); year · format as quiet text under it. On the artist's
                   own page the artist line is dropped: every card is theirs. -->
              {#snippet artistLine()}
                <div class="card-sub" title={item.artist}>{item.artist}</div>
              {/snippet}
              {#snippet factsLine()}
                {#if year}<span class="meta-item">{year}</span>{/if}
                {#if format}<span class="meta-item">{format}</span>{/if}
              {/snippet}
              <MediaCard
                title={item.displayName}
                onactivate={() => handleItemClick(item)}
                sub={item.artist && !isArtistPage ? artistLine : undefined}
                meta={year || format ? factsLine : undefined}
              >
                {#snippet cover()}
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
                {/snippet}
              </MediaCard>
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




  .icon-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    color: var(--c-icon-faint);
    background: var(--c-bg-placeholder);
  }

  .group-header {
    grid-column: 1 / -1;
    width: 100%;
    display: flex;
    align-items: center;
  }

</style>
