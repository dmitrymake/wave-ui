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

  let pressedPlayAll = false;
  let pressedAddToQueue = false;

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

  function openPlaylist(playlist) {
    navigateTo("details", playlist);
  }

  function handleHeaderPlayAll() {
    pressedPlayAll = true;
    MPD.playPlaylistContext(currentView.data.name, 0);
  }

  function playTrack(index) {
    if (isEditMode) return;
    MPD.playPlaylistContext(currentView.data.name, index);
  }

  function addToQueue() {
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
  }

  function handleMoveTrack(fromIndex, toIndex) {
    const playlistName = currentView.data.name;
    MPD.movePlaylistTrack(playlistName, fromIndex, toIndex);
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
            <div class="header-label">Playlist</div>
            <h1 class="header-title" title={currentView.data.name}>
              {currentView.data.name}
            </h1>

            <div class="track-count-sub">
              {$isLoadingTracks
                ? "Loading..."
                : `${$activePlaylistTracks.length} tracks`}
            </div>

            <div class="header-actions">
              <button
                class="btn-primary"
                on:click={handleHeaderPlayAll}
                disabled={pressedPlayAll}
              >
                {pressedPlayAll ? "Playing..." : "Play All"}
              </button>

              <button
                class="btn-secondary"
                on:click={addToQueue}
                disabled={pressedAddToQueue}
              >
                {pressedAddToQueue ? "Added" : "To Queue"}
              </button>

              <button
                class="btn-action"
                class:active={isEditMode}
                title={isEditMode ? "Finish Editing" : "Edit Playlist"}
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
          on:play={() => playTrack(index)}
          on:remove={() => handleRemoveTrack(index)}
          on:startdrag={startDrag}
        />
      </div>
    </BaseList>
  {:else if $isLoadingPlaylists}
    <div class="content-padded">
      <div class="music-grid">
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
      <div class="music-grid">
        <div class="music-card">
          <div class="card-img-container dashed-cover">
            <div class="icon-wrap">
              {@html ICONS.ADD}
            </div>
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
            <div class="card-sub">
              {playlist.lastModified
                ? new Date(playlist.lastModified).toLocaleDateString()
                : "Playlist"}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  @import "./MusicViews.css";

  .view-header {
    display: flex;
    align-items: flex-end;
    gap: 24px;
    padding-bottom: 24px;
    width: 100%;
  }

  .header-art {
    width: 192px;
    height: 192px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .header-info {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    flex: 1;
    min-width: 0;
    height: 192px;
  }

  .header-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--c-accent);
    margin-bottom: 4px;
  }

  .header-title {
    font-size: 48px;
    font-weight: 800;
    color: var(--c-text-primary);
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-count-sub {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 24px;
    font-weight: 500;
  }

  .header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .btn-primary {
    background: var(--c-accent);
    color: #fff;
    border: none;
    padding: 12px 32px;
    border-radius: 30px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 0.1s,
      opacity 0.2s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .btn-primary:active {
    transform: scale(0.97);
  }
  .btn-primary:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    padding: 11px 24px;
    border-radius: 30px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-secondary:hover {
    border-color: #fff;
  }
  .btn-secondary:active {
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-action {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--c-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-action:hover {
    border-color: #fff;
    color: #fff;
  }
  .btn-action.active {
    background: var(--c-accent);
    border-color: var(--c-accent);
    color: #fff;
  }
  .btn-action :global(svg) {
    width: 20px;
    height: 20px;
  }

  .card-img-container {
    display: grid !important;
    place-items: center;
    position: relative;
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

  .header-icon-wrap {
    width: 64px;
    height: 64px;
    color: #fff;
  }
  .header-icon-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }

  .overlay-icon {
    width: 48px;
    color: #fff;
  }

  @media (max-width: 768px) {
    .view-header {
      flex-direction: row;
      align-items: center;
      gap: 16px;
      padding-bottom: 16px;
    }

    .header-art {
      width: 110px;
      height: 110px;
    }

    .header-info {
      height: auto;
      min-height: 110px;
      justify-content: center;
      align-items: flex-start;
      padding-bottom: 0;
      flex: 1;
    }

    .header-title {
      font-size: 20px;
      white-space: normal;
      margin-bottom: 4px;
    }

    .track-count-sub {
      margin-bottom: 12px;
      font-size: 13px;
    }

    .header-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: 8px;
      width: 100%;
    }

    .header-actions .btn-action {
      margin-left: auto;
    }

    .btn-primary,
    .btn-secondary {
      padding: 8px 16px;
      font-size: 12px;
      height: 32px;
    }

    .btn-action {
      width: 32px;
      height: 32px;
    }

    .btn-action :global(svg) {
      width: 16px;
      height: 16px;
    }
  }
</style>
