<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import MediaCard from "../MediaCard.svelte";
  import type { YandexSearchResults as YandexSearchResultsType, YandexArtist, YandexAlbum } from "../../lib/types/yandex";

  let { searchResults = { tracks: [], albums: [], artists: [] }, isLoading = false, onOpenArtist, onOpenAlbum }: {
    searchResults?: YandexSearchResultsType;
    isLoading?: boolean;
    onOpenArtist?: (artist: YandexArtist) => void;
    onOpenAlbum?: (album: YandexAlbum) => void;
  } = $props();

  import { horizontalWheelScroll as handleHorizontalScroll } from "../../lib/horizontalScroll";

  function openArtist(artist: YandexArtist) {
    onOpenArtist?.(artist);
  }

  function openAlbum(album: YandexAlbum) {
    onOpenAlbum?.(album);
  }

  /** Sub line of an artist card. A search row carries nothing but the name, the
      picture and (sometimes) the bio, so the bio is the sub when it is there and
      the role is the fallback — the same "type label" sub PlaylistGrid falls back
      to ("Playlist") when a playlist has no date. An artist card used to have no
      sub row at all. */
  function artistSub(artist: YandexArtist): string {
    return artist.description || "Artist";
  }
</script>

{#if !isLoading}
  {#if searchResults.artists.length > 0}
    <h3 class="header-label section-spacing">Artists</h3>
    <div
      class="music-grid horizontal section-mb identity-grid"
      onwheel={handleHorizontalScroll}
    >
      {#each searchResults.artists as artist}
        <MediaCard
          title={artist.title}
          titleCenter
          playable={false}
          onactivate={() => openArtist(artist)}
        >
          {#snippet cover()}
            <ImageLoader
              src={artist.image ?? ""}
              alt={artist.title}
              radius="var(--radius-md)"
            >
              {#snippet fallback()}
                <div class="icon-fallback">{@html ICONS.ARTISTS}</div>
              {/snippet}
            </ImageLoader>
          {/snippet}
          {#snippet sub()}
            <div class="card-sub">{artistSub(artist)}</div>
          {/snippet}
        </MediaCard>
      {/each}
    </div>
  {/if}
  {#if searchResults.albums.length > 0}
    <h3 class="header-label">Albums</h3>
    <div
      class="music-grid horizontal section-mb"
      onwheel={handleHorizontalScroll}
    >
      {#each searchResults.albums as album}
        <MediaCard title={album.title} onactivate={() => openAlbum(album)}>
          {#snippet cover()}
            <ImageLoader
              src={album.image ?? ""}
              alt={album.title}
              radius="var(--radius-md)"
            >
              {#snippet fallback()}
                <div class="icon-fallback">{@html ICONS.ALBUMS}</div>
              {/snippet}
            </ImageLoader>
          {/snippet}
          {#snippet sub()}
            <!-- Same album card as the library + search views: the artist on its
                 own line, the year as a fact under it. -->
            <div class="card-sub" title={album.artist ?? "Album"}>{album.artist ?? "Album"}</div>
          {/snippet}
          {#snippet meta()}
            {#if album.year}<span class="meta-item">{album.year}</span>{/if}
          {/snippet}
        </MediaCard>
      {/each}
    </div>
  {/if}
{/if}

<style>
  /* Artist cards centre their title, so the sub line centres with it.
     :global() — MediaCard renders .card-sub-row. */
  .identity-grid :global(.card-sub-row) {
    justify-content: center;
  }
</style>
