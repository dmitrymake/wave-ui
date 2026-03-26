<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import type { Playlist, Track } from "../../lib/types";

  let { matchedPlaylists = [], searchResultsGrouped = [], isSearching = false, searchTerm = "", currentTheme = "", playingFile = "", isPlaying = false, onOpenPlaylist, onPlayFoundTracks, onQueueFoundTracks, onPlayTrack }: {
    matchedPlaylists?: Playlist[];
    searchResultsGrouped?: { playlist: Playlist; tracks: Track[] }[];
    isSearching?: boolean;
    searchTerm?: string;
    currentTheme?: string;
    playingFile?: string;
    isPlaying?: boolean;
    onOpenPlaylist?: (playlist: Playlist) => void;
    onPlayFoundTracks?: (detail: { tracks: Track[]; playlistName: string }) => void;
    onQueueFoundTracks?: (detail: { tracks: Track[] }) => void;
    onPlayTrack?: (track: Track) => void;
  } = $props();

  function resolveCardStyle(playlist: Playlist) {
    if (playlist.name === "Favorites") {
      if (currentTheme === "gruvbox") {
        const c = "var(--c-heart)";
        return `background: linear-gradient(135deg, ${c}, transparent); background-color: ${c};`;
      }
      return `background: linear-gradient(135deg, hsl(348, 95%, 58%), hsl(348, 90%, 40%));`;
    }

    if (currentTheme === "gruvbox") {
      return `background: linear-gradient(135deg, ${playlist.colorVar}, transparent); background-color: ${playlist.colorVar};`;
    }
    return `background: ${playlist.color}`;
  }

  function handleHorizontalScroll(e: WheelEvent) {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }
</script>

{#if matchedPlaylists.length > 0}
  <div class="header-label section-spacing">Matched Playlists</div>
  <div
    class="music-grid horizontal section-mb"
    onwheel={handleHorizontalScroll}
  >
    {#each matchedPlaylists as playlist (playlist.name)}
      {@const isFav = playlist.name === "Favorites"}
      <div class="music-card" role="button" tabindex="0" onclick={() => onOpenPlaylist?.(playlist)} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenPlaylist?.(playlist); }}}>
        <div
          class="card-img-container"
          style={resolveCardStyle(playlist)}
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
          role="button"
          tabindex="0"
          onclick={() => onOpenPlaylist?.(group.playlist)}
          onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenPlaylist?.(group.playlist); }}}
        >
          <div class="group-icon">{@html ICONS.PLAYLISTS}</div>
          <div class="group-title">{group.playlist.name}</div>
          <div class="group-count">{group.tracks.length}</div>

          <div class="group-actions">
            <button
              class="btn-icon small"
              title="Play matches"
              onclick={(e) => { e.stopPropagation(); onPlayFoundTracks?.({ tracks: group.tracks, playlistName: group.playlist.name }); }}
            >
              {@html ICONS.PLAY}
            </button>
            <button
              class="btn-icon small"
              title="Add matches to Queue"
              onclick={(e) => { e.stopPropagation(); onQueueFoundTracks?.({ tracks: group.tracks }); }}
            >
              {@html ICONS.ADD}
            </button>
          </div>
        </div>

        <div class="group-tracks">
          {#each group.tracks as track (track._uid)}
            <TrackRow
              {track}
              index={track.playlistPos}
              {playingFile}
              {isPlaying}
              onplay={() => onPlayTrack?.(track)}
            />
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if !isSearching && matchedPlaylists.length === 0 && searchResultsGrouped.length === 0}
  <div class="empty-text">No matches found for "{searchTerm}"</div>
{:else if isSearching && searchResultsGrouped.length === 0}
  <div class="empty-text" style="opacity: 0.7">
    Searching tracks in playlists...
  </div>
{/if}

<style>

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
  .group-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    padding-left: 12px;
  }
  .group-tracks {
    display: flex;
    flex-direction: column;
  }

  .empty-text {
    grid-column: 1/-1;
    text-align: center;
    padding: 40px;
    color: var(--c-text-secondary);
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
</style>
