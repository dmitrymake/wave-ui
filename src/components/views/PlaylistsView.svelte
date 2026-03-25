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
    status,
    currentSong,
    activePlaylistName,
    showToast,
    currentTheme,
  } from "../../lib/store";
  import Skeleton from "../Skeleton.svelte";
  import * as MPD from "../../lib/mpd";
  import { MpdParser } from "../../lib/mpd/parser";
  import { mpdClient } from "../../lib/mpd/client";
  import { LibraryActions } from "../../lib/mpd/library";
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import { readable } from "svelte/store";
  import ImageLoader from "../ImageLoader.svelte";
  import PlaylistGrid from "./PlaylistGrid.svelte";
  import PlaylistSearchResults from "./PlaylistSearchResults.svelte";
  import type { Track, Playlist } from "../../lib/types";

  let isEditMode = $state(false);
  let pressedPlayAll = $state(false);
  let pressedAddToQueue = $state(false);

  let searchTerm = $state("");
  let isDeepSearching = $state(false);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let currentSearchId = 0;

  let matchedPlaylists = $state<Playlist[]>([]);
  let searchResultsGrouped = $state<{ playlist: Playlist; tracks: Track[] }[]>([]);

  let headerTotalDuration = $state("");
  let headerQuality = $state("");

  let playingIndex = $derived(Number($status.song));
  let playingFile = $derived($currentSong.file);
  let isPlaying = $derived($status.state === "play");

  let currentView = $derived($navigationStack[$navigationStack.length - 1]);
  let isDetailsView = $derived(currentView.view === "details");

  let lastViewJson = "";
  $effect(() => {
    const currentJson = JSON.stringify(currentView);
    if (currentJson !== lastViewJson) {
      searchTerm = "";
      pressedPlayAll = false;
      pressedAddToQueue = false;
      isEditMode = false;
      matchedPlaylists = [];
      searchResultsGrouped = [];
      isDeepSearching = false;
      lastViewJson = currentJson;
    }
  });

  function handleSearchInput(e: Event) {
    searchTerm = e.target.value;
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

    currentSearchId++;
    const searchId = currentSearchId;
    isDeepSearching = true;
    const q = query.toLowerCase();

    matchedPlaylists = $playlists.filter((p) =>
      p.name.toLowerCase().includes(q),
    );

    let newGroups = [];
    const targets = $playlists.filter((p) => p.name !== "Favorites");

    for (const pl of targets) {
      if (searchId !== currentSearchId) break;

      try {
        const raw = await mpdClient.send(
          `listplaylistinfo "${pl.name.replace(/"/g, '\\"')}"`,
        );
        const tracks = MpdParser.parseTracks(raw);

        const tracksWithPos = tracks.map((t, i) => ({ ...t, playlistPos: i }));

        const matches = tracksWithPos.filter(
          (t) =>
            (t.title && t.title.toLowerCase().includes(q)) ||
            (t.artist && t.artist.toLowerCase().includes(q)),
        );

        if (matches.length > 0) {
          const processedMatches = matches.map((t) => ({
            ...t,
            _uid: Math.random(),
          }));

          newGroups.push({
            playlist: pl,
            tracks: processedMatches,
          });

          searchResultsGrouped = [...newGroups];
        }
      } catch (e) {
        console.warn(`Failed to search in playlist ${pl.name}`, e);
      }
    }

    if (searchId === currentSearchId) {
      isDeepSearching = false;
    }
  }

  function playTrack(track: Track) {
    if (!isEditMode) MPD.playTrackOptimistic(track);
  }

  function playFoundTracks(tracks: Track[], playlistName: string) {
    showModal({
      title: "Play Search Results?",
      message: `This will clear your queue and play ${tracks.length} matching tracks from "${playlistName}".`,
      confirmLabel: "Play",
      type: "confirm",
      onConfirm: () => {
        MPD.playAllTracks(tracks);
      },
    });
  }

  function queueFoundTracks(tracks: Track[]) {
    if (!tracks || tracks.length === 0) return;
    MPD.addAllToQueue(tracks);
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
      if ($activePlaylistName !== currentView.data.name) {
        MPD.openPlaylistDetails(currentView.data.name);
      }
    }
  });

  onMount(() => {
    if (!isDetailsView && $playlists.length === 0) {
      MPD.loadPlaylists();
    }
  });

  function calculateMeta(tracks: Track[]) {
    const totalSec = tracks.reduce(
      (acc, t) => acc + (parseFloat(t.time) || 0),
      0,
    );
    if (totalSec > 0) {
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      headerTotalDuration = h > 0 ? `${h} hr ${m} min` : `${m} min`;
    } else {
      headerTotalDuration = "";
    }

    const formats = new Set();
    tracks.forEach((t) => {
      if (t.qualityBadge) formats.add(t.qualityBadge.split(" ")[0]);
    });
    headerQuality =
      formats.size === 1
        ? tracks[0].qualityBadge
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
        if (name) LibraryActions.createEmptyPlaylist(name);
      },
    });
  }

  function handlePlaylistContext(e: Event, playlist: Playlist) {
    if (playlist.name === "Favorites") return;
    e.stopPropagation();
    e.preventDefault();
    openContextMenu(e, null, { type: "playlist-card", playlist: playlist });
  }

  function handlePlayAll() {
    showModal({
      title: "Replace Queue?",
      message: `This will clear your current queue and play "${currentView.data.name}".`,
      confirmLabel: "Play",
      type: "confirm",
      onConfirm: () => {
        pressedPlayAll = true;
        if ($activePlaylistTracks && $activePlaylistTracks.length > 0) {
          MPD.playAllTracks($activePlaylistTracks);
        } else {
          pressedPlayAll = false;
        }
      },
    });
  }

  function handleAddToQueue() {
    if ($activePlaylistTracks.length > 0) {
      const safeName = currentView.data.name.replace(/"/g, '\\"');
      MPD.runMpdRequest(`load "${safeName}"`);
      pressedAddToQueue = true;
      setTimeout(() => {
        pressedAddToQueue = false;
      }, 2000);
    }
  }

  function toggleEditMode() {
    isEditMode = !isEditMode;
  }

  function handleRemoveTrack(index: number) {
    const playlistName = currentView.data.name;
    const tracks = $activePlaylistTracks;

    tracks.splice(index, 1);
    activePlaylistTracks.set(tracks);

    MPD.removeFromPlaylist(playlistName, index);
    calculateMeta(tracks);
  }

  function handleMoveTrack(fromIndex: number, toIndex: number) {
    MPD.movePlaylistTrack(currentView.data.name, fromIndex, toIndex);
  }

  let isFavPlaylist = $derived(currentView?.data?.name === "Favorites");

  function resolveHeaderStyle(data: Playlist & { colorVar?: string; color?: string } | null) {
    if (!data) return "";

    if (data.name === "Favorites") {
      if ($currentTheme === "gruvbox") {
        const c = "var(--c-heart)";
        return `background: linear-gradient(135deg, ${c}, transparent); background-color: ${c};`;
      }
      return `background: linear-gradient(135deg, hsl(348, 95%, 58%), hsl(348, 90%, 40%));`;
    }

    const defaultColor = "var(--c-bg-card)";

    if ($currentTheme === "gruvbox") {
      const c = data.colorVar || data.color || defaultColor;
      return `background: linear-gradient(135deg, ${c}, transparent); background-color: ${c};`;
    }

    const c = data.color || data.colorVar || defaultColor;
    return `background: ${c}`;
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
      <div slot="header" class="content-padded">
        <div class="view-header">
          <div class="header-art" style={resolveHeaderStyle(currentView.data)}>
            <div class="header-icon-wrap">
              {@html isFavPlaylist ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
            </div>
          </div>

          <div class="header-info">
            <div class="header-text-group">
              <div class="header-label">Playlist</div>
              <h1 class="header-title" title={currentView.data.name}>
                {currentView.data.name}
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

      <div slot="row" let:item let:index let:startDrag>
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
      </div>
    </BaseList>
  {:else if $isLoadingPlaylists}
    <div class="content-padded">
      <div class="music-grid playlists-grid-override">
        {#each Array(8) as _}
          <div class="music-card skeleton-card">
            <div class="card-img-container">
              <Skeleton width="100%" height="100%" radius="12px" />
            </div>
            <div style="margin-top: 8px;">
              <Skeleton width="60%" height="16px" radius="4px" />
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
  @import "./MusicViews.css";

  .header-icon-wrap {
    width: 64px;
    height: 64px;
    color: #fff;
  }
  .header-icon-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }

  .search-input-container {
    display: flex;
    align-items: center;
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 20px;
    width: 100%;
    box-sizing: border-box;
  }
  .search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-text-muted);
    margin-right: 10px;
    flex-shrink: 0;
  }
  .search-icon :global(svg) {
    width: 18px;
    height: 18px;
  }
  input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    font-size: 15px;
    outline: none;
    min-width: 0;
    padding: 0;
  }
  input::placeholder {
    color: var(--c-text-muted);
  }

  .clear-icon-btn {
    background: transparent;
    border: none;
    color: var(--c-text-muted);
    width: 24px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    margin-right: 4px;
  }
  .clear-icon-btn :global(svg) {
    width: 16px;
    height: 16px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--c-border);
    border-top-color: var(--c-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-left: 8px;
    flex-shrink: 0;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .playlists-grid-override {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)) !important;
    gap: 24px !important;
  }

  .music-card.skeleton-card .card-img-container {
    aspect-ratio: 1;
    background: transparent;
    margin-bottom: 0;
  }
  .music-card.skeleton-card:hover {
    background: transparent;
  }

  @media (max-width: 768px) {
    .playlists-grid-override {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
      gap: 16px !important;
    }
  }
</style>
