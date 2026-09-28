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
</script>

{#if !isLoading}
  {#if searchResults.artists.length > 0}
    <h3 class="header-label">Artists</h3>
    <div
      class="music-grid horizontal section-mb"
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
              radius="8px"
            />
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
              radius="8px"
            />
          {/snippet}
          {#snippet sub()}
            <div class="card-sub">{album.artist}</div>
          {/snippet}
        </MediaCard>
      {/each}
    </div>
  {/if}
{/if}
