<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import MediaCard from "../MediaCard.svelte";
  import SkeletonGrid from "../SkeletonGrid.svelte";
  import Skeleton from "../Skeleton.svelte";
  import type { YandexPlaylist } from "../../lib/types/yandex";

  let { vibeCards = [], collectionCards = [], isLoading = false, onOpenPlaylist }: {
    vibeCards?: YandexPlaylist[];
    collectionCards?: YandexPlaylist[];
    isLoading?: boolean;
    onOpenPlaylist?: (pl: YandexPlaylist) => void;
  } = $props();

  import { horizontalWheelScroll as handleHorizontalScroll } from "../../lib/horizontalScroll";

  function openPlaylist(pl: YandexPlaylist) {
    onOpenPlaylist?.(pl);
  }
</script>

{#if isLoading && vibeCards.length === 0}
  <SkeletonGrid count={4} layout="horizontal" skeletonCard={false} heading="Vibes" headingWidth="100px" subtitleWidth="40%" />
  <SkeletonGrid count={4} layout="horizontal" skeletonCard={false} heading="Collection & Mixes" headingWidth="150px" subtitleWidth="40%" />
{:else}
  <h2 class="header-label">Vibes</h2>
  <div
    class="music-grid horizontal section-mb"
    onwheel={handleHorizontalScroll}
  >
    {#each vibeCards as item}
      <MediaCard
        title={item.title}
        titleCenter
        coverClass={item.kind === "my_vibe" ? "is-vibe" : ""}
        coverStyle={item.bgColor && item.kind !== "my_vibe"
          ? `background: ${item.bgColor}`
          : ""}
        onactivate={() => openPlaylist(item)}
      >
        {#snippet cover()}
          {#if item.kind === "my_vibe"}
            <div class="icon-wrap pulse-anim">{@html ICONS.RADIO}</div>
          {:else if item.cover}
            <ImageLoader
              src={item.cover}
              alt={item.title}
              radius="8px"
            />
          {:else}
            <div class="icon-wrap">{@html ICONS.RADIO}</div>
          {/if}
        {/snippet}
      </MediaCard>
    {/each}
  </div>

  {#if collectionCards.length > 0}
    <h2 class="header-label">Collection & Mixes</h2>
    <div
      class="music-grid horizontal section-mb"
      onwheel={handleHorizontalScroll}
    >
      {#each collectionCards as pl}
        {@const isFav = pl.kind === "favorites"}
        <MediaCard
          title={pl.title}
          coverStyle={isFav ? "background: var(--grad-favorites);" : ""}
          onactivate={() => openPlaylist(pl)}
        >
          {#snippet cover()}
            {#if isFav}
              <div class="icon-wrap">{@html ICONS.HEART_FILLED}</div>
            {:else if pl.cover}
              <ImageLoader src={pl.cover} alt={pl.title} radius="8px">
                {#snippet fallback()}
                  <div class="icon-wrap">{@html ICONS.PLAYLISTS}</div>
                {/snippet}
              </ImageLoader>
            {:else}
              <div class="icon-wrap">{@html ICONS.PLAYLISTS}</div>
            {/if}
          {/snippet}
          {#snippet sub()}
            {#if pl.trackCount}<div class="card-sub">
              {pl.trackCount} tracks
            </div>{/if}
          {/snippet}
        </MediaCard>
      {/each}
    </div>
  {/if}
{/if}

<style>

  /* :global() — the cover and its icon are rendered by MediaCard, not here. */
  :global(.card-img-container.is-vibe) {
    background: var(--grad-vibe);
  }
  :global(.card-img-container.is-vibe .icon-wrap) {
    color: var(--c-text-inverse);
  }

  .pulse-anim :global(svg) {
    animation: pulse-scale 2s infinite ease-in-out;
  }
  @keyframes pulse-scale {
    0%,
    100% {
      transform: scale(1);
      opacity: var(--opacity-visible);
    }
    50% {
      transform: scale(1.1);
      opacity: var(--opacity-strong);
    }
  }

  .icon-wrap {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-text-primary);
  }
  .icon-wrap :global(svg) {
    width: 40px;
    height: 40px;
  }

  /* :global() — MediaCard renders the cover, so this view's own fallback fill
     has to reach into it. */
  :global(.music-card .card-img-container) {
    background-color: var(--c-bg-placeholder);
  }
</style>
