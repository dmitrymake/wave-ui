<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import Skeleton from "../Skeleton.svelte";
  import Button from "../ui/Button.svelte";
  import type { Writable } from "svelte/store";
  import type { YandexAlbum, YandexArtist, YandexHeaderData } from "../../lib/types/yandex";

  let { headerData = null, viewMode = "", isLoading = false, tracksCount = 0, albumsStore, onPlayAll, onAddAllToQueue, onPlayVibe, onOpenAlbum }: {
    headerData?: YandexHeaderData;
    viewMode?: string;
    isLoading?: boolean;
    tracksCount?: number;
    albumsStore: Writable<YandexAlbum[]>;
    onPlayAll?: () => void;
    onAddAllToQueue?: () => void;
    onPlayVibe?: (type: string) => void;
    onOpenAlbum?: (album: YandexAlbum) => void;
  } = $props();

  // `image` lives on YandexAlbum/YandexArtist (not YandexPlaylist), `artist` only on YandexAlbum.
  // Narrow the union for access; runtime value is unchanged.
  const headerImage = $derived((headerData as YandexAlbum | YandexArtist | null)?.image);
  const headerArtist = $derived((headerData as YandexAlbum | null)?.artist);

  import { horizontalWheelScroll as handleHorizontalScroll } from "../../lib/horizontalScroll";

  function playAll() {
    onPlayAll?.();
  }

  function addAllToQueue() {
    onAddAllToQueue?.();
  }

  function playVibe(type: string) {
    onPlayVibe?.(type);
  }

  function openAlbum(album: YandexAlbum) {
    onOpenAlbum?.(album);
  }
</script>

{#if viewMode !== "search" && headerData}
  {#if isLoading && !headerData.cover && !headerImage}
    <div class="view-header">
      <div class="header-art">
        <Skeleton width="100%" height="100%" radius="8px" />
      </div>
      <div class="header-info">
        <Skeleton
          width="100px"
          height="14px"
          style="margin-bottom:var(--space-2)"
        />
        <Skeleton
          width="80%"
          height="40px"
          style="margin-bottom:var(--space-2)"
        />
        <Skeleton
          width="60%"
          height="20px"
          style="margin-bottom:var(--space-4)"
        />
        <div class="header-actions">
          <Skeleton width="100px" height="36px" radius="18px" />
          <Skeleton width="100px" height="36px" radius="18px" />
        </div>
      </div>
    </div>
  {:else}
    <div class="view-header">
      <div
        class="header-art"
        style={headerData.kind === "favorites"
          ? "background: var(--grad-favorites);"
          : ""}
      >
        {#if headerData.kind === "favorites"}
          <div class="icon-wrap">{@html ICONS.HEART_FILLED}</div>
        {:else}
          <ImageLoader
            src={headerData.cover || headerImage || ""}
            alt={headerData.title}
            radius="8px"
          >
            {#snippet fallback()}
              <div class="icon-fallback">
                {@html ICONS.ALBUMS}
              </div>
            {/snippet}
          </ImageLoader>
        {/if}
      </div>
      <div class="header-info">
        <div class="header-text-group">
          <div class="header-label">
            {viewMode
              .replace("_details", "")
              .toUpperCase()
              .replace("YANDEX_", "")}
          </div>
          <h1 class="header-title">
            {headerData.title || headerData.name}
          </h1>
          {#if headerArtist || headerData.description}
            <h2 class="header-sub-text">
              {headerArtist || headerData.description}
            </h2>
          {/if}
        </div>
        <div class="header-actions">
          <Button
            variant="primary"
            onclick={playAll}
            disabled={isLoading || tracksCount === 0}>Play All</Button
          >
          {#if viewMode === "artist_details"}
            <Button variant="secondary" onclick={() => playVibe("artist")}>
              <span class="icon-inline">{@html ICONS.RADIO}</span> Artist
              Vibe
            </Button>
          {:else if viewMode === "album_details"}
            <Button variant="secondary" onclick={() => playVibe("album")}>
              <span class="icon-inline">{@html ICONS.RADIO}</span> Vibe
            </Button>
          {:else}
            <Button
              variant="secondary"
              onclick={addAllToQueue}
              disabled={isLoading || tracksCount === 0}>To Queue</Button
            >
          {/if}
        </div>
      </div>
    </div>
  {/if}
{/if}

{#if viewMode === "artist_details" && $albumsStore.length > 0}
  <h3 class="header-label" style="margin-top: var(--space-5);">Albums</h3>
  <div
    class="music-grid horizontal section-mb"
    onwheel={handleHorizontalScroll}
  >
    {#each $albumsStore as album}
      <div class="music-card" role="button" tabindex="0" onclick={() => openAlbum(album)} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAlbum(album); }}}>
        <div class="card-img-container">
          <ImageLoader
            src={album.image ?? ""}
            alt={album.title}
            radius="8px"
          />
          <div class="play-overlay">
            <span class="overlay-icon">{@html ICONS.PLAY}</span>
          </div>
        </div>
        <div class="card-title">{album.title}</div>
        <div class="card-sub">{album.year}</div>
      </div>
    {/each}
  </div>
  <h3 class="header-label">Popular Tracks</h3>
{/if}

<style>

  .icon-wrap {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }
  .icon-wrap :global(svg) {
    width: 40px;
    height: 40px;
  }

  .header-sub-text {
    font-size: var(--text-2xl);
    color: var(--c-white-60);
    margin: var(--space-0);
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: var(--weight-regular);
  }

  .icon-inline {
    display: inline-flex;
    align-items: center;
    margin-right: var(--space-2);
  }
  .icon-inline :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }
</style>
