<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import IconButton from "../ui/IconButton.svelte";
  import { getPlaylistCoverStyle } from "../../lib/playlistColor";
  import { FAVORITES_PLAYLIST } from "../../lib/constants";
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
    return getPlaylistCoverStyle(playlist, currentTheme, { fallbackToDefault: false });
  }

  import { horizontalWheelScroll as handleHorizontalScroll } from "../../lib/horizontalScroll";
</script>

{#if matchedPlaylists.length > 0}
  <div class="header-label section-spacing">Matched Playlists</div>
  <div
    class="music-grid horizontal section-mb"
    onwheel={handleHorizontalScroll}
  >
    {#each matchedPlaylists as playlist (playlist.name)}
      {@const isFav = playlist.name === FAVORITES_PLAYLIST}
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
            <IconButton
              ariaLabel="Play matches"
              title="Play matches"
              size="sm"
              onclick={(e) => { e.stopPropagation(); onPlayFoundTracks?.({ tracks: group.tracks, playlistName: group.playlist.name }); }}
            >
              {@html ICONS.PLAY}
            </IconButton>
            <IconButton
              ariaLabel="Add matches to Queue"
              title="Add matches to Queue"
              size="sm"
              onclick={(e) => { e.stopPropagation(); onQueueFoundTracks?.({ tracks: group.tracks }); }}
            >
              {@html ICONS.ADD}
            </IconButton>
          </div>
        </div>

        <div class="group-tracks">
          {#each group.tracks as track (track._uid)}
            <TrackRow
              {track}
              index={track.playlistPos ?? 0}
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
  <div class="empty-text" style="opacity: var(--opacity-dim)">
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
    gap: var(--space-5);
  }
  .group-container {
    background: var(--c-bg-card);
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: var(--border-default-dim);
  }
  .group-header {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    background: var(--c-surface-hover);
    cursor: pointer;
    border-bottom: var(--border-default-dim);
  }
  .group-header:hover {
    background: var(--c-surface-active);
  }
  .group-icon {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
    margin-right: var(--space-3);
    color: var(--c-text-secondary);
  }
  .group-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
  .group-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--c-text-primary);
    flex: 1;
  }
  .group-count {
    background: var(--c-surface-button);
    padding: var(--space-0_5) var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    color: var(--c-text-muted);
  }
  .group-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
    padding-left: var(--space-3);
  }
  .group-tracks {
    display: flex;
    flex-direction: column;
  }

  .empty-text {
    grid-column: 1/-1;
    text-align: center;
    padding: var(--space-10);
    color: var(--c-text-secondary);
  }

  .section-mb {
    margin-bottom: var(--space-6);
  }
  .section-spacing {
    margin-top: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .header-label {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    color: var(--c-text-primary);
  }
</style>
