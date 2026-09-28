<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import { longpress } from "../../lib/actions";
  import { getPlaylistCoverStyle } from "../../lib/playlistColor";
  import { FAVORITES_PLAYLIST } from "../../lib/constants";
  import type { Playlist } from "../../lib/types";
  import IconButton from "../ui/IconButton.svelte";
  import MediaCard from "../MediaCard.svelte";

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
  <MediaCard title="New Playlist" coverClass="dashed-cover" playable={false} onactivate={() => onNewPlaylist?.()}>
    {#snippet cover()}
      <div class="icon-wrap">{@html ICONS.ADD}</div>
    {/snippet}
  </MediaCard>

  {#each playlists as playlist (playlist.name)}
    {@const isFav = playlist.name === FAVORITES_PLAYLIST}
    <MediaCard
      title={playlist.name}
      coverStyle={resolveCardStyle(playlist)}
      onactivate={() => onOpenPlaylist?.(playlist)}
      oncontextmenu={(e) => handleContext(e, playlist)}
    >
      {#snippet cover()}
        <div class="icon-wrap">
          {@html isFav ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
        </div>
      {/snippet}
      {#snippet coverExtra()}
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
      {/snippet}
      {#snippet sub()}
        <div class="card-sub">
          {playlist.lastModified
            ? new Date(playlist.lastModified).toLocaleDateString()
            : "Playlist"}
        </div>
      {/snippet}
    </MediaCard>
  {/each}
</div>

<style>


  /* The cover is rendered by MediaCard, so these reach through the grid with
     :global() — anchored on the local grid so they stay this view's rules. */
  .playlists-grid-override :global(.card-img-container.dashed-cover) {
    border: var(--border-width-thick) dashed var(--c-border);
    background: transparent !important;
    /* Same corners as the cover it stands in for. */
    border-radius: var(--radius-md);
  }


  .playlists-grid-override :global(.card-menu-btn) {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    /* Quiet until the card is touched (opacity, not background, so a mouse user
       gets a hint too). */
    opacity: var(--opacity-hidden);
    z-index: var(--z-overlay-local);
  }
  .playlists-grid-override :global(.music-card:hover .card-menu-btn) {
    opacity: var(--opacity-visible);
  }



  @media (hover: none) {
    /* No hover on a touch screen: the chip is simply always there. */
    .playlists-grid-override :global(.card-menu-btn) {
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
