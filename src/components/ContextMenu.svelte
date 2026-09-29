<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { MOTION, EASE_EMPHASIZED } from "../lib/transitions";
  import {
    contextMenu,
    closeContextMenu,
    favorites,
    playlists,
  } from "../lib/store";
  import { ICONS } from "../lib/icons";
  import * as actions from "../lib/contextMenuActions";
  import { calculateMenuPosition } from "../lib/menuPositioner";
  import { isRemoteUrl } from "../lib/utils";
  import { isTrackLiked, sourceLikesVersion } from "../lib/playerHelpers";
  import { resolveSourceForTrack } from "../lib/sources/trackSource";
  import { FAVORITES_PLAYLIST } from "../lib/constants";

  let innerWidth = $state(0);
  let innerHeight = $state(0);
  let menuEl: HTMLElement;
  let menuHeight = $state(0);
  let menuWidth = $state(0);

  let view = $state<"main" | "playlists">("main");
  let prevFocus: HTMLElement | null = null;

  $effect(() => {
    if ($contextMenu.isOpen) {
      view = "main";
    }
  });

  // Overlay closes via Escape/backdrop only — no history.* side-effects.
  // Move focus into the menu on open, refocus on view switches, and restore the
  // trigger focus on close.
  // WHERE focus lands depends on how the menu was reached. From the keyboard
  // (the trigger shows :focus-visible) it goes to the first row, as a menu
  // should. From a finger or a mouse it goes to the card itself: Chromium
  // matches :focus-visible on a script focus during a touch, so the first row
  // wore the grey focus plate and "Play Next" looked pre-selected on every
  // long-press (reproduced with a real CDP touch long-press, not only with the
  // synthetic event). The card still takes Escape, and ArrowDown enters the list.
  $effect(() => {
    const open = $contextMenu.isOpen;
    void view; // re-run (and refocus) when switching main<->playlists
    if (open) {
      if (!prevFocus) prevFocus = document.activeElement as HTMLElement | null;
      const fromKeyboard = !!(document.activeElement as HTMLElement | null)?.matches?.(":focus-visible");
      queueMicrotask(() => {
        const first = menuEl?.querySelector<HTMLButtonElement>(".menu-row");
        if (first && fromKeyboard) first.focus();
        else menuEl?.focus();
      });
    } else if (prevFocus) {
      prevFocus.focus?.();
      prevFocus = null;
    }
  });

  function handlePopState(_event: PopStateEvent) {
    // Browser Back while the menu is open just closes the menu.
    if ($contextMenu.isOpen) {
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

  // $sourceLikesVersion is read only as a generic reactivity trigger so this re-runs
  // when a streaming source's likes change; isTrackLiked resolves the owning source.
  let isLiked = $derived.by(() => {
    void $sourceLikesVersion;
    return isTrackLiked($contextMenu.track, $favorites);
  });
  let isRadio = $derived(
    $contextMenu.track &&
    isRemoteUrl($contextMenu.track.file));

  let isStreamTrack = $derived(
    $contextMenu.track &&
    !!resolveSourceForTrack($contextMenu.track));

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
    transition:fade={{ duration: MOTION.fast }}
  >
    <!-- Enters on the fast step with a small scale from its anchor corner
         (transform-origin comes from the positioner); leaves on the instant
         step as a plain fade — an exit should get out of the way. -->
    <div
      class="menu-card"
      bind:this={menuEl}
      bind:clientHeight={menuHeight}
      bind:clientWidth={menuWidth}
      style={stylePosition}
      in:scale={{ start: 0.96, duration: MOTION.fast, easing: EASE_EMPHASIZED }}
      out:fade={{ duration: MOTION.instant }}
      onclick={(e) => e.stopPropagation()}
      role="menu"
      aria-label="Track actions"
      tabindex="-1"
      onkeydown={(e) => {
        if (e.key === "Escape") closeContextMenu();
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const items = menuEl?.querySelectorAll<HTMLButtonElement>(".menu-row");
          if (!items?.length) return;
          const idx = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);
          const next = e.key === "ArrowDown"
            ? items[(idx + 1) % items.length]
            : items[(idx - 1 + items.length) % items.length];
          next.focus();
        }
      }}
    >
      <div class="menu-header">
        {#if view === "playlists"}
          <button class="back-btn-area" onclick={backToMain} aria-label="Back to actions">
            <span class="back-icon">{@html ICONS.BACK}</span>
          </button>
          <span class="header-title">Select Playlist</span>
        {:else if isPlaylistCard}
          <div class="track-info">
            <div class="title text-ellipsis" title={$contextMenu.context.playlist?.name}>
              {$contextMenu.context.playlist?.name}
            </div>
            <div class="artist text-ellipsis">Playlist</div>
          </div>
        {:else}
          <div class="track-info">
            <div class="title text-ellipsis" title={$contextMenu.track?.title}>{$contextMenu.track?.title}</div>
            <div class="artist text-ellipsis" title={$contextMenu.track?.artist}>{$contextMenu.track?.artist}</div>
          </div>
        {/if}
      </div>

      <div class="menu-items scroll-y">
        {#if view === "playlists"}
          {#each $playlists as pl}
            {#if pl.name !== FAVORITES_PLAYLIST}
              <button class="menu-row" role="menuitem" onclick={() => actions.addToPlaylist($contextMenu.track, pl.name)}>
                <span class="icon">{@html ICONS.PLAYLISTS}</span>
                <span>{pl.name}</span>
              </button>
            {/if}
          {/each}
          {#if $playlists.filter((p) => p.name !== FAVORITES_PLAYLIST).length === 0}
            <div class="empty-msg">No custom playlists</div>
          {/if}
        {:else if isPlaylistCard}
          <button class="menu-row" role="menuitem" onclick={() => actions.playlistPlay($contextMenu.context)}>
            <span class="icon">{@html ICONS.PLAY}</span>
            <span>Play Now</span>
          </button>

          <div class="sep"></div>

          <button class="menu-row" role="menuitem" onclick={() => actions.playlistRename($contextMenu.context)}>
            <span class="icon">{@html ICONS.EDIT}</span>
            <span>Rename</span>
          </button>

          <button class="menu-row" role="menuitem" onclick={() => actions.playlistDelete($contextMenu.context)}>
            <span class="icon">{@html ICONS.REMOVE}</span>
            <span>Delete Playlist</span>
          </button>
        {:else}
          <button class="menu-row" role="menuitem" onclick={() => actions.playNext($contextMenu.track)}>
            <span class="icon">{@html ICONS.NEXT}</span>
            <span>Play Next</span>
          </button>

          <button class="menu-row" role="menuitem" onclick={() => actions.addToQueue($contextMenu.track)}>
            <span class="icon">{@html ICONS.MENU}</span>
            <span>Add to Queue</span>
          </button>

          <button class="menu-row" role="menuitem" onclick={showPlaylists}>
            <span class="icon">{@html ICONS.ADD_TO_PLAYLIST || ICONS.ADD}</span>
            <span>Add to Playlist…</span>
          </button>

          {#if isStreamTrack}
            <div class="sep"></div>
            <button class="menu-row" role="menuitem" onclick={() => actions.radioByTrack($contextMenu.track)}>
              <span class="icon">{@html ICONS.RADIO}</span>
              <span>Vibe by Track</span>
            </button>
            <button class="menu-row" role="menuitem" onclick={() => actions.radioByArtist($contextMenu.track)}>
              <span class="icon">{@html ICONS.ARTISTS}</span>
              <span>Vibe by Artist</span>
            </button>
          {/if}

          {#if !isRadio && !isStreamTrack}
            <button class="menu-row" role="menuitem" onclick={() => actions.goToAlbum($contextMenu.track)}>
              <span class="icon">{@html ICONS.ALBUM_LINK || ICONS.ALBUMS}</span>
              <span>Go to Album</span>
            </button>

            <button class="menu-row" role="menuitem" onclick={() => actions.goToArtist($contextMenu.track)}>
              <span class="icon"
                >{@html ICONS.ARTIST_LINK || ICONS.ARTISTS}</span
              >
              <span>Go to Artist</span>
            </button>
          {/if}

          <button class="menu-row" role="menuitem" onclick={() => actions.toggleLike($contextMenu.track)}>
            <span class="icon" class:liked={isLiked}>
              {@html isLiked ? ICONS.HEART_FILLED : ICONS.HEART}
            </span>
            <span>{isLiked ? "Unlike" : "Like"}</span>
          </button>

          {#if isPlaylistContext}
            <div class="sep"></div>
            <button class="menu-row" role="menuitem" onclick={() => actions.removeFromPlaylist($contextMenu.context)}>
              <span class="icon">{@html ICONS.REMOVE}</span>
              <span>Remove from Playlist</span>
            </button>
          {/if}

          {#if isQueueContext}
            <div class="sep"></div>
            <button class="menu-row" role="menuitem" onclick={() => actions.removeFromQueue($contextMenu.context)}>
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

  /* The card takes focus only as a keyboard anchor (Escape, ArrowDown into the
     list) — it is not a control, so it draws no ring. */
  .menu-card:focus {
    outline: none;
  }
  .menu-card {
    background: var(--c-bg-card);
    width: 220px;
    max-height: 400px;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: var(--border-default);
    z-index: var(--z-context-menu);
  }

  .menu-header {
    padding: var(--space-0);
    height: var(--control-h-2xl);
    background: var(--c-white-10);
    border-bottom: var(--border-default);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .track-info {
    padding: var(--space-0) var(--space-14px);
    overflow: hidden;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
  }

  /* The header is the subject of the menu: the item role at body size
     (semibold, not the display bold), its performer in the meta role. */
  .title {
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-snug);
    color: var(--c-text-primary);
    margin-bottom: var(--space-0_5);
  }

  .artist {
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    color: var(--c-text-secondary);
  }

  .header-title {
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    color: var(--c-text-primary);
    padding-right: var(--space-14px);
  }

  .back-btn-area {
    background: none;
    border: none;
    color: var(--c-text-primary);
    width: var(--control-h-xl);
    height: 100%;
    padding: var(--space-0);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: var(--space-1);
    /* Icon-only control: circle, like every other icon button in the app. */
    border-radius: var(--radius-circle);
  }
  .back-btn-area:active {
    background: var(--c-white-10);
  }
  .back-icon {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
    display: block;
  }
  .back-icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .menu-items {
    padding: var(--space-1) var(--space-0);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .menu-row {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-14px);
    background: transparent;
    border: none;
    /* Rounded so the shared gray focus plate keeps the app's corner language. */
    border-radius: var(--radius-sm);
    color: var(--c-text-primary);
    font-size: var(--text-base);
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-instant);
    width: 100%;
  }

  .menu-row:active {
    background: var(--c-surface-hover);
  }
  @media (hover: hover) {
    .menu-row:hover {
      background: var(--c-surface-hover);
    }
  }

  .icon {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
    margin-right: var(--space-14px);
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
    height: var(--border-width-thin);
    background: var(--c-border);
    margin: var(--space-1) var(--space-4);
    opacity: var(--opacity-ghost);
  }

  .empty-msg {
    padding: var(--space-4);
    text-align: center;
    color: var(--c-text-muted);
    font-size: var(--text-base);
  }
</style>
