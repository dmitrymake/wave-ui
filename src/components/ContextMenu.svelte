<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import {
    contextMenu,
    closeContextMenu,
    favorites,
    playlists,
    ignoreNextPopState,
  } from "../lib/store";
  import { ICONS } from "../lib/icons";
  import * as actions from "../lib/contextMenuActions";
  import { calculateMenuPosition } from "../lib/menuPositioner";
  import { isRemoteUrl } from "../lib/utils";

  let innerWidth: number;
  let innerHeight: number;
  let menuEl: HTMLElement;
  let menuHeight = $state(0);
  let menuWidth = $state(0);

  let view = $state<"main" | "playlists">("main");
  let historyPushed = $state(false);

  $effect(() => {
    if ($contextMenu.isOpen) {
      view = "main";
    }
  });

  $effect(() => {
    if ($contextMenu.isOpen) {
      if (!historyPushed && typeof history !== "undefined") {
        history.pushState({ contextMenuOpen: true }, "");
        historyPushed = true;
      }
    } else {
      if (historyPushed && typeof history !== "undefined") {
        ignoreNextPopState.set(true);
        history.back();
        historyPushed = false;
      }
    }
  });

  function handlePopState(_event: PopStateEvent) {
    if ($contextMenu.isOpen) {
      historyPushed = false;
      closeContextMenu();
    }
  }

  function handleBackdropClick() {
    closeContextMenu();
  }

  function showPlaylists() {
    view = "playlists";
  }

  function backToMain() {
    view = "main";
  }

  let isLiked = $derived($contextMenu.track && $favorites.has($contextMenu.track.file));
  let isRadio = $derived(
    $contextMenu.track &&
    isRemoteUrl($contextMenu.track.file));

  let isYandexTrack = $derived(
    $contextMenu.track &&
    ($contextMenu.track.isYandex || $contextMenu.track.service === "yandex"));

  let isPlaylistContext = $derived($contextMenu.context?.type === "playlist");
  let isQueueContext = $derived($contextMenu.context?.type === "queue");
  let isPlaylistCard = $derived($contextMenu.context?.type === "playlist-card");
  let isMiniPlayerSource = $derived($contextMenu.context?.source === "miniplayer");

  let stylePosition = $derived(calculateMenuPosition({
    isOpen: $contextMenu.isOpen,
    triggerRect: $contextMenu.triggerRect,
    x: $contextMenu.x,
    y: $contextMenu.y,
    menuWidth,
    menuHeight,
    innerWidth,
    innerHeight,
    isMiniPlayerSource,
  }));
</script>

<svelte:window bind:innerWidth bind:innerHeight onpopstate={handlePopState} />

{#if $contextMenu.isOpen}
  <div
    class="backdrop"
    onclick={handleBackdropClick}
    role="presentation"
    transition:fade={{ duration: 100 }}
  >
    <div
      class="menu-card"
      bind:this={menuEl}
      bind:clientHeight={menuHeight}
      bind:clientWidth={menuWidth}
      style={stylePosition}
      transition:scale={{ start: 0.95, duration: 100 }}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      onkeydown={(e) => { if (e.key === "Escape") closeContextMenu(); }}
    >
      <div class="menu-header">
        {#if view === "playlists"}
          <button class="back-btn-area" onclick={backToMain}>
            <span class="back-icon">{@html ICONS.BACK}</span>
          </button>
          <span class="header-title">Select Playlist</span>
        {:else if isPlaylistCard}
          <div class="track-info">
            <div class="title text-ellipsis">
              {$contextMenu.context.playlist.name}
            </div>
            <div class="artist text-ellipsis">Playlist</div>
          </div>
        {:else}
          <div class="track-info">
            <div class="title text-ellipsis">{$contextMenu.track.title}</div>
            <div class="artist text-ellipsis">{$contextMenu.track.artist}</div>
          </div>
        {/if}
      </div>

      <div class="menu-items scroll-y">
        {#if view === "playlists"}
          {#each $playlists as pl}
            {#if pl.name !== "Favorites"}
              <button class="menu-row" onclick={() => actions.addToPlaylist($contextMenu.track, pl.name)}>
                <span class="icon">{@html ICONS.PLAYLISTS}</span>
                <span>{pl.name}</span>
              </button>
            {/if}
          {/each}
          {#if $playlists.filter((p) => p.name !== "Favorites").length === 0}
            <div class="empty-msg">No custom playlists</div>
          {/if}
        {:else if isPlaylistCard}
          <button class="menu-row" onclick={() => actions.playlistPlay($contextMenu.context)}>
            <span class="icon">{@html ICONS.PLAY}</span>
            <span>Play Now</span>
          </button>

          <div class="sep"></div>

          <button class="menu-row" onclick={() => actions.playlistRename($contextMenu.context)}>
            <span class="icon">{@html ICONS.EDIT}</span>
            <span>Rename</span>
          </button>

          <button class="menu-row" onclick={() => actions.playlistDelete($contextMenu.context)}>
            <span class="icon">{@html ICONS.REMOVE}</span>
            <span>Delete Playlist</span>
          </button>
        {:else}
          <button class="menu-row" onclick={() => actions.playNext($contextMenu.track)}>
            <span class="icon">{@html ICONS.NEXT}</span>
            <span>Play Next</span>
          </button>

          <button class="menu-row" onclick={() => actions.addToQueue($contextMenu.track)}>
            <span class="icon">{@html ICONS.MENU}</span>
            <span>Add to Queue</span>
          </button>

          <button class="menu-row" onclick={showPlaylists}>
            <span class="icon">{@html ICONS.ADD_TO_PLAYLIST || ICONS.ADD}</span>
            <span>Add to Playlist...</span>
          </button>

          {#if isYandexTrack}
            <div class="sep"></div>
            <button class="menu-row" onclick={() => actions.radioByTrack($contextMenu.track)}>
              <span class="icon">{@html ICONS.RADIO}</span>
              <span>Vibe by Track</span>
            </button>
            <button class="menu-row" onclick={() => actions.radioByArtist($contextMenu.track)}>
              <span class="icon">{@html ICONS.ARTISTS}</span>
              <span>Vibe by Artist</span>
            </button>
          {/if}

          {#if !isRadio && !isYandexTrack}
            <button class="menu-row" onclick={() => actions.goToAlbum($contextMenu.track)}>
              <span class="icon">{@html ICONS.ALBUM_LINK || ICONS.ALBUMS}</span>
              <span>Go to Album</span>
            </button>

            <button class="menu-row" onclick={() => actions.goToArtist($contextMenu.track)}>
              <span class="icon"
                >{@html ICONS.ARTIST_LINK || ICONS.ARTISTS}</span
              >
              <span>Go to Artist</span>
            </button>
          {/if}

          <button class="menu-row" onclick={() => actions.toggleLike($contextMenu.track)}>
            <span class="icon" class:liked={isLiked}>
              {@html isLiked ? ICONS.HEART_FILLED : ICONS.HEART}
            </span>
            <span>{isLiked ? "Unlike" : "Like"}</span>
          </button>

          {#if isPlaylistContext}
            <div class="sep"></div>
            <button class="menu-row" onclick={() => actions.removeFromPlaylist($contextMenu.context)}>
              <span class="icon">{@html ICONS.REMOVE}</span>
              <span>Remove from Playlist</span>
            </button>
          {/if}

          {#if isQueueContext}
            <div class="sep"></div>
            <button class="menu-row" onclick={() => actions.removeFromQueue($contextMenu.context)}>
              <span class="icon">{@html ICONS.REMOVE}</span>
              <span>Remove from Queue</span>
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: transparent;
    backdrop-filter: blur(2px);
  }

  .menu-card {
    background: #1e1e1e;
    width: 220px;
    max-height: 400px;
    border-radius: 12px;
    box-shadow: 0 10px 40px var(--c-black-70);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--c-border);
    z-index: 10001;
  }

  .menu-header {
    padding: 0;
    height: 50px;
    background: var(--c-white-10);
    border-bottom: 1px solid var(--c-border);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .track-info {
    padding: 0 14px;
    overflow: hidden;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
  }

  .title {
    font-size: 13px;
    font-weight: 700;
    color: var(--c-text-primary);
    margin-bottom: 2px;
  }

  .artist {
    font-size: 12px;
    color: var(--c-text-secondary);
  }

  .header-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--c-text-primary);
    padding-right: 14px;
  }

  .back-btn-area {
    background: none;
    border: none;
    color: var(--c-text-primary);
    width: 48px;
    height: 100%;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 4px;
  }
  .back-btn-area:active {
    background: var(--c-white-10);
  }
  .back-icon {
    width: 20px;
    height: 20px;
    display: block;
  }
  .back-icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .menu-items {
    padding: 6px 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .menu-row {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
    width: 100%;
  }

  .menu-row:active,
  .menu-row:hover {
    background: var(--c-surface-hover);
  }

  .icon {
    width: 20px;
    height: 20px;
    margin-right: 14px;
    color: var(--c-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon.liked {
    color: var(--c-heart);
  }
  .icon.liked :global(svg) {
    stroke: none;
  }

  .sep {
    height: 1px;
    background: var(--c-border);
    margin: 6px 16px;
    opacity: 0.3;
  }

  .empty-msg {
    padding: 16px;
    text-align: center;
    color: var(--c-text-muted);
    font-size: 13px;
  }
</style>
