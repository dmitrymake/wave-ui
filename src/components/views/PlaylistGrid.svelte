<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import { longpress } from "../../lib/actions";
  import { getPlaylistCoverStyle } from "../../lib/playlistColor";
  import { FAVORITES_PLAYLIST } from "../../lib/constants";
  import type { Playlist } from "../../lib/types";
  import IconButton from "../ui/IconButton.svelte";

  let { playlists = [], currentTheme = "", onOpenPlaylist, onContextMenu, onNewPlaylist }: {
    playlists?: Playlist[];
    currentTheme?: string;
    onOpenPlaylist?: (playlist: Playlist) => void;
    onContextMenu?: (detail: { event: Event; playlist: Playlist }) => void;
    onNewPlaylist?: () => void;
  } = $props();

  function resolveCardStyle(playlist: Playlist) {
    return getPlaylistCoverStyle(playlist, currentTheme, { defaultFallback: "colorVar" });
  }

  function handleContext(e: Event, playlist: Playlist) {
    onContextMenu?.({ event: e, playlist });
  }
</script>

<div class="music-grid playlists-grid-override">
  <div class="music-card" role="button" tabindex="0" onclick={() => onNewPlaylist?.()} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNewPlaylist?.(); }}}>
    <div class="card-img-container dashed-cover">
      <div class="icon-wrap">{@html ICONS.ADD}</div>
    </div>
    <div class="card-title">New Playlist</div>
  </div>

  {#each playlists as playlist (playlist.name)}
    {@const isFav = playlist.name === FAVORITES_PLAYLIST}
    <div
      class="music-card"
      role="button"
      tabindex="0"
      onclick={() => onOpenPlaylist?.(playlist)}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenPlaylist?.(playlist); }}}
      use:longpress
      onlongpress={(e) => handleContext(e.detail.originalEvent, playlist)}
      oncontextmenu={(e) => handleContext(e, playlist)}
    >
      <div
        class="card-img-container"
        style={resolveCardStyle(playlist)}
      >
        <div class="icon-wrap">
          {@html isFav ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
        </div>
        {#if !isFav}
          <IconButton
            class="card-menu-btn"
            variant="overlay"
            size="xs"
            ariaLabel="More actions for {playlist.name}"
            icon={ICONS.DOTS}
            onclick={(e) => handleContext(e, playlist)}
          />
        {/if}
        <div class="play-overlay">
          <span class="overlay-icon">{@html ICONS.PLAY}</span>
        </div>
      </div>
      <div class="card-title" title={playlist.name}>{playlist.name}</div>
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

<style>


  .dashed-cover {
    border: var(--border-width-thick) dashed var(--c-border);
    background: transparent !important;
    /* Same corners as the cover it stands in for. */
    border-radius: var(--radius-md);
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

  .card-img-container :global(.card-menu-btn) {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    /* Quiet until the card is touched (opacity, not background, so a mouse user
       gets a hint too). */
    opacity: var(--opacity-hidden);
    z-index: var(--z-overlay-local);
  }
  .music-card:hover :global(.card-menu-btn) {
    opacity: var(--opacity-visible);
  }



  @media (hover: none) {
    /* No hover on a touch screen: the chip is simply always there. */
    .card-img-container :global(.card-menu-btn) {
      opacity: var(--opacity-visible);
    }
  }
  @media (max-width: 768px) {
    .playlists-grid-override {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
      gap: var(--space-4) !important;
    }
  }
</style>
