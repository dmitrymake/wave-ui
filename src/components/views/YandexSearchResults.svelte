<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import type { YandexSearchResults as YandexSearchResultsType, YandexArtist, YandexAlbum } from "../../lib/types";

  let { searchResults = { tracks: [], albums: [], artists: [] }, isLoading = false, onOpenArtist, onOpenAlbum }: {
    searchResults?: YandexSearchResultsType;
    isLoading?: boolean;
    onOpenArtist?: (artist: YandexArtist) => void;
    onOpenAlbum?: (album: YandexAlbum) => void;
  } = $props();

  function handleHorizontalScroll(e: WheelEvent) {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }

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
        <div class="music-card" onclick={() => openArtist(artist)}>
          <div class="card-img-container">
            <ImageLoader
              src={artist.image}
              alt={artist.title}
              radius="8px"
            />
          </div>
          <div class="card-title center">{artist.title}</div>
        </div>
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
        <div class="music-card" onclick={() => openAlbum(album)}>
          <div class="card-img-container">
            <ImageLoader
              src={album.image}
              alt={album.title}
              radius="8px"
            />
          </div>
          <div class="card-title">{album.title}</div>
          <div class="card-sub">{album.artist}</div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  @import "./MusicViews.css";

  .card-title.center {
    text-align: center;
  }
</style>
