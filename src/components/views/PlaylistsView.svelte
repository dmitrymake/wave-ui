<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    playlists,
    isLoadingPlaylists,
    activePlaylistTracks,
    isLoadingTracks,
    navigationStack,
    navigateTo,
    showModal,
    openContextMenu,
    type EventWithDetail,
    status,
    currentSong,
    activePlaylistName,
    showToast,
    currentTheme,
  } from "../../lib/store";
  import Skeleton from "../Skeleton.svelte";
  import {
    playTrackOptimistic,
    playAllTracks,
    addAllToQueue,
    openPlaylistDetails,
    loadPlaylists,
    createEmptyPlaylist,
    addPlaylistToQueue,
    removeFromPlaylist,
    movePlaylistTrack,
  } from "../../lib/playerActions";
  import { searchPlaylists } from "../../lib/playlistSearch";
  import { getPlaylistCoverStyle } from "../../lib/playlistColor";
  import { FAVORITES_PLAYLIST } from "../../lib/constants";
  import { formatTotalDuration } from "../../lib/utils";
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import { readable } from "svelte/store";
  import ImageLoader from "../ImageLoader.svelte";
  import PlaylistGrid from "./PlaylistGrid.svelte";
  import PlaylistSearchResults from "./PlaylistSearchResults.svelte";
  import type { Track, Playlist } from "../../lib/types";
  import Button from "../ui/Button.svelte";

  let isEditMode = $state(false);
  let pressedPlayAll = $state(false);
  let pressedAddToQueue = $state(false);

  let searchTerm = $state("");
  let isDeepSearching = $state(false);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let searchAbort: AbortController | null = null;

  let matchedPlaylists = $state<Playlist[]>([]);
  let searchResultsGrouped = $state<{ playlist: Playlist; tracks: Track[] }[]>([]);

  let headerTotalDuration = $state("");
  let headerQuality = $state("");

  let playingIndex = $derived(Number($status.song));
  let playingFile = $derived($currentSong.file);
  let isPlaying = $derived($status.state === "play");

  let currentView = $derived($navigationStack[$navigationStack.length - 1]);
  let isDetailsView = $derived(currentView.view === "details");
  let currentViewName = $derived((currentView.data as { name?: string } | null)?.name ?? "");

  let lastViewKey = "";
  $effect(() => {
    const currentKey = `${currentView.view}:${(currentView.data as { name?: string } | null)?.name ?? ""}`;
    if (currentKey !== lastViewKey) {
      searchTerm = "";
      pressedPlayAll = false;
      pressedAddToQueue = false;
      isEditMode = false;
      matchedPlaylists = [];
      searchResultsGrouped = [];
      isDeepSearching = false;
      lastViewKey = currentKey;
    }
  });

  function handleSearchInput(e: Event & { currentTarget: HTMLInputElement }) {
    searchTerm = e.currentTarget.value;
    clearTimeout(searchDebounceTimer);

    if (searchTerm.length >= 2) {
      searchDebounceTimer = setTimeout(() => {
        performDeepSearch(searchTerm);
      }, 600);
    } else {
      isDeepSearching = false;
      matchedPlaylists = [];
      searchResultsGrouped = [];
    }
  }

  async function performDeepSearch(query: string) {
    if (!query) return;

    searchAbort?.abort();
    const ctrl = new AbortController();
    searchAbort = ctrl;
    isDeepSearching = true;

    matchedPlaylists = $playlists.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()),
    );

    const { groups } = await searchPlaylists(
      query,
      $playlists,
      ctrl.signal,
      (g) => {
        if (!ctrl.signal.aborted) searchResultsGrouped = g;
      },
    );

    if (ctrl.signal.aborted) return;
    searchResultsGrouped = groups;
    isDeepSearching = false;
  }

  function playTrack(track: Track) {
    if (!isEditMode) playTrackOptimistic(track);
  }

  function playFoundTracks(tracks: Track[], playlistName: string) {
    showModal({
      title: "Play Search Results?",
      message: `This will clear your queue and play ${tracks.length} matching tracks from "${playlistName}".`,
      confirmLabel: "Play",
      type: "confirm",
      onConfirm: () => {
        playAllTracks(tracks);
      },
    });
  }

  function queueFoundTracks(tracks: Track[]) {
    if (!tracks || tracks.length === 0) return;
    addAllToQueue(tracks);
  }

  $effect(() => {
    if (isDetailsView && $activePlaylistTracks.length > 0) {
      calculateMeta($activePlaylistTracks);
    } else if (
      isDetailsView &&
      $activePlaylistTracks.length === 0 &&
      !$isLoadingTracks
    ) {
      headerTotalDuration = "0 min";
      headerQuality = "";
    }
  });

  $effect(() => {
    if (isDetailsView && currentView.data) {
      const data = currentView.data as { name: string };
      if ($activePlaylistName !== data.name) {
        openPlaylistDetails(data.name);
      }
    }
  });

  onMount(() => {
    if (!isDetailsView && $playlists.length === 0) {
      loadPlaylists();
    }
  });

  function calculateMeta(tracks: Track[]) {
    const totalSec = tracks.reduce(
      (acc, t) => acc + (parseFloat(String(t.time)) || 0),
      0,
    );
    headerTotalDuration = formatTotalDuration(totalSec);

    const formats = new Set();
    tracks.forEach((t) => {
      if (t.qualityBadge) formats.add(t.qualityBadge.split(" ")[0]);
    });
    headerQuality =
      formats.size === 1
        ? tracks[0].qualityBadge ?? ""
        : formats.size > 1
          ? "Mixed"
          : "";
  }

  function openPlaylist(playlist: Playlist) {
    navigateTo("details", playlist);
  }

  function handleNewPlaylist() {
    showModal({
      title: "New Playlist",
      message: "Enter a name for the new playlist:",
      type: "prompt",
      placeholder: "Playlist Name",
      confirmLabel: "Create",
      onConfirm: (name) => {
        if (name) createEmptyPlaylist(name);
      },
    });
  }

  function handlePlaylistContext(e: Event, playlist: Playlist) {
    if (playlist.name === FAVORITES_PLAYLIST) return;
    e.stopPropagation();
    e.preventDefault();
    openContextMenu(e as EventWithDetail, null, { type: "playlist-card", playlist: playlist });
  }

  function handlePlayAll() {
    const data = (currentView.data ?? {}) as { name?: string };
    showModal({
      title: "Replace Queue?",
      message: `This will clear your current queue and play "${data.name}".`,
      confirmLabel: "Play",
      type: "confirm",
      onConfirm: () => {
        pressedPlayAll = true;
        if ($activePlaylistTracks && $activePlaylistTracks.length > 0) {
          playAllTracks($activePlaylistTracks);
        } else {
          pressedPlayAll = false;
        }
      },
    });
  }

  function handleAddToQueue() {
    if ($activePlaylistTracks.length > 0) {
      const data = (currentView.data ?? {}) as { name: string };
      addPlaylistToQueue(data.name);
      pressedAddToQueue = true;
      setTimeout(() => {
        pressedAddToQueue = false;
      }, 2000);
    }
  }

  function toggleEditMode() {
    isEditMode = !isEditMode;
  }

  async function handleRemoveTrack(index: number) {
    const playlistName = (currentView.data as { name: string }).name;
    const original = $activePlaylistTracks;
    const removed = original[index];

    // Build the new list immutably instead of mutating the shared store array.
    const next = original.filter((_, i) => i !== index);
    activePlaylistTracks.set(next);
    calculateMeta(next);

    const ok = await removeFromPlaylist(playlistName, index);
    if (!ok) {
      // Restore the optimistically-removed track on backend failure.
      const restored = [...next.slice(0, index), removed, ...next.slice(index)];
      activePlaylistTracks.set(restored);
      calculateMeta(restored);
    }
  }

  function handleMoveTrack(fromIndex: number, toIndex: number) {
    movePlaylistTrack((currentView.data as { name: string }).name, fromIndex, toIndex);
  }

  let isFavPlaylist = $derived(currentView?.data?.name === FAVORITES_PLAYLIST);

  // Reads only the optional name/colour fields off a playlist-card descriptor, so
  // the loosely-typed NavigationEntry.data assigns with a single narrowing cast
  // instead of an `as unknown as Playlist` double cast.
  function resolveHeaderStyle(data: { name?: string; colorVar?: string; color?: string } | null) {
    if (!data) return "";
    return getPlaylistCoverStyle(data, $currentTheme);
  }
</script>

<div class="view-container" class:scrollable={!isDetailsView}>
  {#if !isDetailsView}
    <div class="content-padded no-bottom-pad">
      <div class="search-input-container">
        <span class="search-icon">{@html ICONS.SEARCH}</span>
        <input
          type="text"
          placeholder="Search playlists & tracks..."
          value={searchTerm}
          oninput={handleSearchInput}
        />
        {#if searchTerm}
          <button
            class="clear-icon-btn"
            onclick={() => {
              searchTerm = "";
              matchedPlaylists = [];
              searchResultsGrouped = [];
              isDeepSearching = false;
            }}
          >
            {@html ICONS.CLOSE}
          </button>
        {/if}
        {#if isDeepSearching}
          <div class="spinner"></div>
        {/if}
      </div>
    </div>
  {/if}

  {#if isDetailsView}
    <BaseList
      itemsStore={activePlaylistTracks}
      isLoading={$isLoadingTracks}
      {isEditMode}
      emptyText="This playlist is empty."
      onMoveItem={handleMoveTrack}
    >
      {#snippet header()}
        <div class="content-padded">
          <div class="view-header">
            <div class="header-art" style={resolveHeaderStyle((currentView.data as { name?: string; colorVar?: string; color?: string }) ?? null)}>
              <div class="header-icon-wrap">
                {@html isFavPlaylist ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
              </div>
            </div>

            <div class="header-info">
              <div class="header-text-group">
                <div class="header-label">Playlist</div>
                <h1 class="header-title" title={currentViewName}>
                  {currentViewName}
                </h1>

                <div class="meta-badges">
                  {#if $isLoadingTracks}
                    <span class="meta-tag">Loading...</span>
                  {:else}
                    <span class="meta-tag"
                      >{$activePlaylistTracks.length} tracks</span
                    >
                    {#if headerTotalDuration}<span class="meta-tag"
                        >{headerTotalDuration}</span
                      >{/if}
                    {#if headerQuality}<span class="meta-tag quality"
                        >{headerQuality}</span
                      >{/if}
                  {/if}
                </div>
              </div>

              <div class="header-actions">
                <Button
                  variant="primary"
                  onclick={handlePlayAll}
                  disabled={pressedPlayAll}
                >
                  {pressedPlayAll ? "Playing..." : "Play All"}
                </Button>
                <Button
                  variant="secondary"
                  onclick={handleAddToQueue}
                  disabled={pressedAddToQueue}
                >
                  {pressedAddToQueue ? "Added" : "To Queue"}
                </Button>
                <button
                  class="btn-action"
                  class:active={isEditMode}
                  title="Edit"
                  onclick={toggleEditMode}
                >
                  {@html isEditMode ? ICONS.ACCEPT : ICONS.EDIT}
                </button>
              </div>
            </div>
          </div>
        </div>
      {/snippet}

      {#snippet row({ item, index, startDrag })}
        <TrackRow
          track={item}
          {index}
          {playingIndex}
          {playingFile}
          {isPlaying}
          isEditable={isEditMode}
          onplay={() => playTrack(item)}
          onremove={() => handleRemoveTrack(index)}
          onstartdrag={startDrag}
        />
      {/snippet}
    </BaseList>
  {:else if $isLoadingPlaylists}
    <div class="content-padded">
      <div class="music-grid playlists-grid-override">
        {#each Array(8) as _}
          <div class="music-card skeleton-card">
            <div class="card-img-container">
              <Skeleton width="100%" height="100%" radius="var(--radius-md)" />
            </div>
            <div style="margin-bottom: var(--space-1);">
              <Skeleton width="60%" height="15px" radius="var(--radius-sm)" />
            </div>
            <div>
              <Skeleton width="40%" height="13px" radius="var(--radius-sm)" style="opacity: var(--opacity-muted)" />
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="content-padded">
      {#if !searchTerm}
        <PlaylistGrid
          playlists={$playlists}
          currentTheme={$currentTheme}
          onOpenPlaylist={(playlist) => openPlaylist(playlist)}
          onContextMenu={({ event, playlist }) => handlePlaylistContext(event, playlist)}
          onNewPlaylist={handleNewPlaylist}
        />
      {:else}
        <PlaylistSearchResults
          {matchedPlaylists}
          {searchResultsGrouped}
          isSearching={isDeepSearching}
          {searchTerm}
          currentTheme={$currentTheme}
          {playingFile}
          {isPlaying}
          onOpenPlaylist={(playlist) => openPlaylist(playlist)}
          onPlayFoundTracks={({ tracks, playlistName }) => playFoundTracks(tracks, playlistName)}
          onQueueFoundTracks={({ tracks }) => queueFoundTracks(tracks)}
          onPlayTrack={(track) => playTrack(track)}
        />
      {/if}
    </div>
  {/if}
</div>

<style>

  .header-icon-wrap {
    width: 64px;
    height: 64px;
    color: var(--c-text-primary);
  }
  .header-icon-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }

  .search-input-container {
    display: flex;
    align-items: center;
    background: var(--c-surface-input);
    border: var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-5);
    width: 100%;
    box-sizing: border-box;
  }
  .search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-text-muted);
    margin-right: var(--space-2);
    flex-shrink: 0;
  }
  .search-icon :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }
  input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    font-size: var(--text-lg);
    outline: none;
    min-width: 0;
    padding: var(--space-0);
  }
  input::placeholder {
    color: var(--c-text-muted);
  }

  .clear-icon-btn {
    background: transparent;
    border: none;
    color: var(--c-text-muted);
    width: var(--switch-h);
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: var(--space-0);
    margin-right: var(--space-1);
  }
  .clear-icon-btn :global(svg) {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
  }

  .spinner {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    border: var(--border-width-thick) solid var(--c-border);
    border-top-color: var(--c-accent);
    border-radius: var(--radius-circle);
    animation: spin 0.6s var(--ease-linear) infinite;
    margin-left: var(--space-2);
    flex-shrink: 0;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .playlists-grid-override {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)) !important;
    gap: var(--space-6) !important;
  }

  .music-card.skeleton-card .card-img-container {
    aspect-ratio: 1;
    background: transparent;
    margin-bottom: var(--space-0);
  }
  .music-card.skeleton-card:hover {
    background: transparent;
  }

  @media (max-width: 768px) {
    .playlists-grid-override {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
      gap: var(--space-4) !important;
    }
  }
</style>
