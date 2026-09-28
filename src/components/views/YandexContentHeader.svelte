<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import MediaCard from "../MediaCard.svelte";
  import Skeleton from "../Skeleton.svelte";
  import Button from "../ui/Button.svelte";
  import type { Writable } from "svelte/store";
  import type { YandexAlbum, YandexArtist, YandexHeaderData, YandexPlaylist } from "../../lib/types/yandex";

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

  /** Count chips under the header title — the same `.meta-tag` role the
      library and playlist headers use.

      `tracksCount` is only trustworthy where Yandex hands the whole list over:
      artist and album details load once and never paginate. A playlist does
      paginate 50 at a time, so there the count comes from the nav entry
      (trackCount) instead, and nothing is claimed when it is missing. */
  const countBadges = $derived.by(() => {
    const badges: string[] = [];
    if (viewMode === "artist_details" || viewMode === "album_details") {
      if (tracksCount > 0) badges.push(`${tracksCount} tracks`);
      if (viewMode === "artist_details" && $albumsStore.length > 0) {
        badges.push(`${$albumsStore.length} albums`);
      }
    } else {
      const total = (headerData as YandexPlaylist | null)?.trackCount;
      if (typeof total === "number" && total > 0) badges.push(`${total} tracks`);
    }
    return badges;
  });

  /** Release year of an album, which rides in on the nav entry (the album
      objects the shelves and search results render both carry it). */
  const headerYear = $derived(
    viewMode === "album_details" ? (headerData as YandexAlbum | null)?.year : undefined
  );
</script>

{#if viewMode !== "search" && headerData}
  {#if isLoading && !headerData.cover && !headerImage}
    <div class="view-header">
      <div class="header-art">
        <Skeleton width="100%" height="100%" radius="var(--radius-md)" />
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
          <!-- .header-icon-wrap: the app's header-emblem role (queue, playlist).
               This view had its own copy at 100%/40px. -->
          <div class="header-icon-wrap">{@html ICONS.HEART_FILLED}</div>
        {:else}
          <ImageLoader
            src={headerData.cover || headerImage || ""}
            alt={headerData.title}
            radius="var(--radius-md)"
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
          <h1 class="header-title" title={headerData.title || headerData.name}>
            {headerData.title || headerData.name}
          </h1>
          {#if headerArtist || headerData.description}
            <!-- Album: artist + year, the row the library's album header uses. -->
            <div class="header-subtitle-row">
              <h2 class="header-sub-text" title={headerArtist || headerData.description}>
                {headerArtist || headerData.description}
              </h2>
              {#if headerYear}
                <span class="meta-tag">{headerYear}</span>
              {/if}
            </div>
          {/if}
          {#if countBadges.length > 0}
            <div class="meta-badges">
              {#each countBadges as badge}
                <span class="meta-tag">{badge}</span>
              {/each}
            </div>
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
  <h3 class="header-label section-spacing">Albums</h3>
  <div
    class="music-grid horizontal section-mb"
    onwheel={handleHorizontalScroll}
  >
    {#each $albumsStore as album}
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
          <!-- The app's album card: artist as the sub, year as the badge. -->
          <div class="card-sub">{album.artist ?? "Album"}</div>
          {#if album.year}
            <div class="card-badge">{album.year}</div>
          {/if}
        {/snippet}
      </MediaCard>
    {/each}
  </div>
  <h3 class="header-label">Popular Tracks</h3>
{/if}

<style>

  /* Glyph inside a labelled pill — Button's own sizing, so only the
     alignment and the stroke belong here. */
  .icon-inline {
    display: inline-flex;
    align-items: center;
  }
  .icon-inline :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
    stroke-width: var(--icon-stroke-width);
  }
</style>
