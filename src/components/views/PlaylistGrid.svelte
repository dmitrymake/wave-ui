<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import { longpress } from "../../lib/actions";
  import type { Playlist } from "../../lib/types";

  let { playlists = [], currentTheme = "", onOpenPlaylist, onContextMenu, onNewPlaylist }: {
    playlists?: Playlist[];
    currentTheme?: string;
    onOpenPlaylist?: (playlist: Playlist) => void;
    onContextMenu?: (detail: { event: Event; playlist: Playlist }) => void;
    onNewPlaylist?: () => void;
  } = $props();

  function resolveCardStyle(playlist: Playlist) {
    if (playlist.name === "Favorites") {
      if (currentTheme === "gruvbox") {
        const c = "var(--c-heart)";
        return `background: linear-gradient(135deg, ${c}, transparent); background-color: ${c};`;
      }
      return `background: linear-gradient(135deg, hsl(348, 95%, 58%), hsl(348, 90%, 40%));`;
    }

    const c = playlist.colorVar || playlist.color || "var(--c-bg-card)";
    if (currentTheme === "gruvbox") {
      return `background: linear-gradient(135deg, ${c}, transparent); background-color: ${c};`;
    }
    return `background: ${c}`;
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
    {@const isFav = playlist.name === "Favorites"}
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
          <button
            class="card-menu-btn"
            onclick={(e) => handleContext(e, playlist)}
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

<style>

  .playlists-grid-override {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)) !important;
    gap: 24px !important;
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

  .card-menu-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--c-black-20);
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
    background: var(--c-black-50);
  }
  .card-menu-btn :global(svg) {
    width: 16px;
    height: 16px;
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
