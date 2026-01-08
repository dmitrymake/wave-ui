<script>
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
    queue,
    status,
    currentSong,
    activePlaylistName,
    showToast,
  } from "../../lib/store";
  import Skeleton from "../Skeleton.svelte";
  import * as MPD from "../../lib/mpd";
  import { MpdParser } from "../../lib/mpd/parser";
  import { mpdClient } from "../../lib/mpd/client";
  import { LibraryActions } from "../../lib/mpd/library";
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import { longpress } from "../../lib/actions";
  import { readable } from "svelte/store";
  import ImageLoader from "../ImageLoader.svelte";

  let isEditMode = false;
  let pressedPlayAll = false;
  let pressedAddToQueue = false;

  // SEARCH STATE (Root View Only)
  let searchTerm = "";
  let isDeepSearching = false;
  let searchDebounceTimer;
  let currentSearchId = 0;

  // Search Results
  let matchedPlaylists = [];
  let searchResultsGrouped = [];

  // Header Data
  let headerTotalDuration = "";
  let headerQuality = "";

  $: playingIndex = Number($status.song);
  $: playingFile = $currentSong.file;
  $: isPlaying = $status.state === "play";

  $: currentView = $navigationStack[$navigationStack.length - 1];
  $: isDetailsView = currentView.view === "details";

  // Reset state on view navigation
  let lastViewJson = "";
  $: {
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
  }

  // --- DEEP SEARCH LOGIC (Root View Only) ---
  function handleSearchInput(e) {
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

  async function performDeepSearch(query) {
    if (!query) return;

    currentSearchId++;
    const searchId = currentSearchId;
    isDeepSearching = true;
    const q = query.toLowerCase();

    // 1. Filter Playlists by Name
    matchedPlaylists = $playlists.filter((p) =>
      p.name.toLowerCase().includes(q),
    );

    // 2. Search Tracks inside All Playlists
    let newGroups = [];
    const targets = $playlists.filter((p) => p.name !== "Favorites");

    for (const pl of targets) {
      if (searchId !== currentSearchId) break;

      try {
        const raw = await mpdClient.send(
          `listplaylistinfo "${pl.name.replace(/"/g, '\\"')}"`,
        );
        const tracks = MpdParser.parseTracks(raw);

        // ВАЖНО: Сначала мапим индекс, потому что MPD listplaylistinfo не возвращает поле Pos
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

  function playTrack(track) {
    if (!isEditMode) MPD.playTrackOptimistic(track);
  }

  function handleHorizontalScroll(e) {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }

  // --- STANDARD COMPONENT LOGIC ---

  $: if (isDetailsView && $activePlaylistTracks.length > 0) {
    calculateMeta($activePlaylistTracks);
  } else if (
    isDetailsView &&
    $activePlaylistTracks.length === 0 &&
    !$isLoadingTracks
  ) {
    headerTotalDuration = "0 min";
    headerQuality = "";
  }

  $: if (isDetailsView && currentView.data) {
    if ($activePlaylistName !== currentView.data.name) {
      MPD.openPlaylistDetails(currentView.data.name);
    }
  }

  onMount(() => {
    if (!isDetailsView && $playlists.length === 0) {
      MPD.loadPlaylists();
    }
  });

  function calculateMeta(tracks) {
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

  function openPlaylist(playlist) {
    navigateTo("details", playlist);
  }

  function handleNewPlaylist() {
    if ($queue.length === 0) {
      showModal({
        title: "Create Playlist",
        message:
          "Queue is empty. Add tracks to queue before saving a playlist.",
        confirmLabel: "OK",
        type: "alert",
      });
      return;
    }

    showModal({
      title: "New Playlist",
      message: "Save current queue as a new playlist:",
      type: "prompt",
      placeholder: "Playlist Name",
      confirmLabel: "Create",
      onConfirm: (name) => {
        if (name) LibraryActions.createPlaylistFromQueue(name);
      },
    });
  }

  function handlePlaylistContext(e, playlist) {
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
        MPD.playPlaylistContext(currentView.data.name, 0);
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

  function handleRemoveTrack(index) {
    const playlistName = currentView.data.name;
    const tracks = $activePlaylistTracks;

    tracks.splice(index, 1);
    activePlaylistTracks.set(tracks);

    MPD.removeFromPlaylist(playlistName, index);
    calculateMeta(tracks);
  }

  function handleMoveTrack(fromIndex, toIndex) {
    MPD.movePlaylistTrack(currentView.data.name, fromIndex, toIndex);
  }

  $: isFavPlaylist = currentView?.data?.name === "Favorites";
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
          on:input={handleSearchInput}
        />
        {#if searchTerm}
          <button
            class="clear-icon-btn"
            on:click={() => {
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
          <div
            class="header-art"
            style="background: {isFavPlaylist
              ? 'linear-gradient(135deg, hsl(348, 95%, 58%), hsl(348, 90%, 40%))'
              : currentView.data.color || '#333'};"
          >
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
              <button
                class="btn-action"
                class:active={isEditMode}
                title="Edit"
                on:click={toggleEditMode}
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
          on:play={() => playTrack(item)}
          on:remove={() => handleRemoveTrack(index)}
          on:startdrag={startDrag}
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
        <div class="music-grid playlists-grid-override">
          <div class="music-card" on:click={handleNewPlaylist}>
            <div class="card-img-container dashed-cover">
              <div class="icon-wrap">{@html ICONS.ADD}</div>
            </div>
            <div class="card-title">New Playlist</div>
          </div>

          {#each $playlists as playlist (playlist.name)}
            {@const isFav = playlist.name === "Favorites"}
            <div
              class="music-card"
              on:click={() => openPlaylist(playlist)}
              use:longpress
              on:longpress={(e) =>
                handlePlaylistContext(e.detail.originalEvent, playlist)}
              on:contextmenu={(e) => handlePlaylistContext(e, playlist)}
            >
              <div
                class="card-img-container"
                style="background: {playlist.color};"
              >
                <div class="icon-wrap">
                  {@html isFav ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
                </div>
                {#if !isFav}
                  <button
                    class="card-menu-btn"
                    on:click={(e) => handlePlaylistContext(e, playlist)}
                  >
                    {@html ICONS.DOTS}
                  </button>
                {/if}
                <div class="play-overlay">
                  <span class="overlay-icon">{@html ICONS.PLAY}</span>
                </div>
              </div>
              <div class="card-title">{playlist.name}</div>
              <div class="card-sub-row">
                <div class="card-sub">
                  {playlist.lastModified
                    ? new Date(playlist.lastModified).toLocaleDateString()
                    : "Playlist"}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        {#if matchedPlaylists.length > 0}
          <div class="header-label section-spacing">Matched Playlists</div>
          <div
            class="music-grid horizontal section-mb"
            on:wheel={handleHorizontalScroll}
          >
            {#each matchedPlaylists as playlist (playlist.name)}
              {@const isFav = playlist.name === "Favorites"}
              <div class="music-card" on:click={() => openPlaylist(playlist)}>
                <div
                  class="card-img-container"
                  style="background: {playlist.color}; aspect-ratio: 1;"
                >
                  <div class="icon-wrap">
                    {@html isFav ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
                  </div>
                  <div class="play-overlay">
                    <span class="overlay-icon">{@html ICONS.PLAY}</span>
                  </div>
                </div>
                <div class="card-title">{playlist.name}</div>
              </div>
            {/each}
          </div>
        {/if}

        {#if searchResultsGrouped.length > 0}
          <div class="header-label section-spacing">Matched Tracks</div>
          <div class="grouped-results">
            {#each searchResultsGrouped as group (group.playlist.name)}
              <div class="group-container">
                <div
                  class="group-header"
                  on:click={() => openPlaylist(group.playlist)}
                >
                  <div class="group-icon">{@html ICONS.PLAYLISTS}</div>
                  <div class="group-title">{group.playlist.name}</div>
                  <div class="group-count">{group.tracks.length}</div>
                </div>
                <div class="group-tracks">
                  {#each group.tracks as track (track._uid)}
                    <TrackRow
                      {track}
                      index={track.playlistPos}
                      {playingFile}
                      {isPlaying}
                      on:play={() => playTrack(track)}
                    />
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if !isDeepSearching && matchedPlaylists.length === 0 && searchResultsGrouped.length === 0}
          <div class="empty-text">No matches found for "{searchTerm}"</div>
        {:else if isDeepSearching && searchResultsGrouped.length === 0}
          <div class="empty-text" style="opacity: 0.7">
            Searching tracks in playlists...
          </div>
        {/if}
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

  .dashed-cover {
    border: 2px dashed var(--c-border);
    background: transparent !important;
  }

  .icon-wrap {
    width: 30%;
    height: 30%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-white-90);
  }
  .icon-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }

  .playlists-grid-override {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)) !important;
    gap: 24px !important;
  }

  .card-menu-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--c-white-50);
    border: none;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    opacity: 0;
    transition:
      opacity 0.2s,
      background 0.2s;
    z-index: 10;
    cursor: pointer;
  }
  .music-card:hover .card-menu-btn {
    opacity: 1;
  }
  .card-menu-btn:hover {
    background: var(-c-black-90);
  }
  .card-menu-btn :global(svg) {
    width: 16px;
    height: 16px;
  }

  /* Search Styles */
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

  .section-mb {
    margin-bottom: 24px;
  }
  .section-spacing {
    margin-top: 10px;
    margin-bottom: 12px;
  }
  .header-label {
    font-size: 18px;
    font-weight: 700;
    color: var(--c-text-primary);
  }

  .empty-text {
    grid-column: 1/-1;
    text-align: center;
    padding: 40px;
    color: var(--c-text-secondary);
  }

  .music-card.skeleton-card .card-img-container {
    aspect-ratio: 1;
    background: transparent;
    margin-bottom: 0;
  }
  .music-card.skeleton-card:hover {
    background: transparent;
  }

  /* Grouped Search Results Styles */
  .grouped-results {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .group-container {
    background: var(--c-bg-card);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--c-border-dim);
  }
  .group-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background: var(--c-surface-hover);
    cursor: pointer;
    border-bottom: 1px solid var(--c-border-dim);
  }
  .group-header:hover {
    background: var(--c-surface-active);
  }
  .group-icon {
    width: 20px;
    height: 20px;
    margin-right: 12px;
    color: var(--c-text-secondary);
  }
  .group-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
  .group-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--c-text-primary);
    flex: 1;
  }
  .group-count {
    background: var(--c-surface-button);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 12px;
    color: var(--c-text-muted);
  }
  .group-tracks {
    display: flex;
    flex-direction: column;
  }

  @media (hover: none) {
    .card-menu-btn {
      opacity: 1;
      background: transparent;
    }
  }
  @media (max-width: 768px) {
    .playlists-grid-override {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
      gap: 16px !important;
    }
  }
</style>
