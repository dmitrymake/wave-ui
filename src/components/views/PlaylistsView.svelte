<script>
  import { onMount } from "svelte";
  import {
    playlists,
    isLoadingPlaylists,
    activePlaylistTracks,
    isLoadingTracks,
    navigationStack,
    navigateTo,
  } from "../../lib/store";
  import Skeleton from "../Skeleton.svelte";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";

  let isEditMode = false;

  // UI State
  let pressedPlayAll = false;
  let pressedAddToQueue = false;

  // Header Data
  let headerTotalDuration = "";
  let headerQuality = "";

  $: currentView = $navigationStack[$navigationStack.length - 1];
  $: isDetailsView = currentView.view === "details";

  $: if (currentView) {
    pressedPlayAll = false;
    pressedAddToQueue = false;
  }

  $: if (isDetailsView && $activePlaylistTracks.length > 0) {
    const tracks = $activePlaylistTracks;
    if (!tracks[0]._uid) {
      const styledTracks = tracks.map((t) => ({ ...t, _uid: Math.random() }));
      activePlaylistTracks.set(styledTracks);
    }
    calculateMeta(tracks);
  } else if (
    isDetailsView &&
    $activePlaylistTracks.length === 0 &&
    !$isLoadingTracks
  ) {
    headerTotalDuration = "0 min";
    headerQuality = "";
  }

  $: if (isDetailsView && currentView.data) {
    isEditMode = false;
    MPD.openPlaylistDetails(currentView.data.name);
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

  function handlePlayAll() {
    pressedPlayAll = true;
    // Play All по-прежнему заменяет очередь (это логично для кнопки "Играть всё")
    MPD.playPlaylistContext(currentView.data.name, 0);
  }

  // ИСПРАВЛЕНО: Теперь используем playTrackOptimistic
  function playTrack(track) {
    if (!isEditMode) {
      // Это вызовет playUri, который сделает addid -> moveid -> playid
      // не очищая очередь
      MPD.playTrackOptimistic(track);
    }
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
          <div class="music-card">
            <Skeleton
              width="100%"
              style="aspect-ratio: 1; border-radius: 12px; margin-bottom: 12px;"
            />
            <Skeleton width="60%" height="16px" />
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="content-padded">
      <div class="music-grid playlists-grid-override">
        <div class="music-card">
          <div class="card-img-container dashed-cover">
            <div class="icon-wrap">{@html ICONS.ADD}</div>
          </div>
          <div class="card-title">New Playlist</div>
        </div>
        {#each $playlists as playlist}
          {@const isFav = playlist.name === "Favorites"}
          <div class="music-card" on:click={() => openPlaylist(playlist)}>
            <div
              class="card-img-container"
              style="background: {playlist.color};"
            >
              <div class="icon-wrap">
                {@html isFav ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
              </div>
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
    color: rgba(255, 255, 255, 0.9);
  }
  .icon-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }

  .playlists-grid-override {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)) !important;
    gap: 24px !important;
  }

  @media (max-width: 768px) {
    .playlists-grid-override {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
      gap: 16px !important;
    }
  }
</style>
