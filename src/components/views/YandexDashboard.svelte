<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import Skeleton from "../Skeleton.svelte";
  import type { YandexPlaylist } from "../../lib/types";

  let { vibeCards = [], collectionCards = [], isLoading = false, onOpenPlaylist }: {
    vibeCards?: YandexPlaylist[];
    collectionCards?: YandexPlaylist[];
    isLoading?: boolean;
    onOpenPlaylist?: (pl: YandexPlaylist) => void;
  } = $props();

  function handleHorizontalScroll(e: WheelEvent) {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }

  function openPlaylist(pl: YandexPlaylist) {
    onOpenPlaylist?.(pl);
  }
</script>

{#if isLoading && vibeCards.length === 0}
  <h2 class="header-label"><Skeleton width="100px" height="20px" /></h2>
  <div class="music-grid horizontal section-mb">
    {#each Array(4) as _}
      <div class="music-card">
        <Skeleton
          width="100%"
          style="aspect-ratio: 1; border-radius: 8px; margin-bottom: 8px;"
        />
        <Skeleton width="80%" height="16px" />
      </div>
    {/each}
  </div>
  <h2 class="header-label"><Skeleton width="150px" height="20px" /></h2>
  <div class="music-grid horizontal section-mb">
    {#each Array(4) as _}
      <div class="music-card">
        <Skeleton
          width="100%"
          style="aspect-ratio: 1; border-radius: 8px; margin-bottom: 8px;"
        />
        <Skeleton width="80%" height="16px" />
      </div>
    {/each}
  </div>
{:else}
  <h2 class="header-label">Vibes</h2>
  <div
    class="music-grid horizontal section-mb"
    onwheel={handleHorizontalScroll}
  >
    {#each vibeCards as item}
      <div class="music-card" onclick={() => openPlaylist(item)}>
        <div
          class="card-img-container"
          class:is-vibe={item.kind === "my_vibe"}
          style={item.bgColor && !item.is_vibe
            ? `background: ${item.bgColor}`
            : ""}
        >
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

          <div class="play-overlay">
            <span class="overlay-icon">{@html ICONS.PLAY}</span>
          </div>
        </div>
        <div class="card-title center">{item.title}</div>
      </div>
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
        <div class="music-card" onclick={() => openPlaylist(pl)}>
          <div
            class="card-img-container"
            style={isFav
              ? "background: linear-gradient(135deg, #fa2d48, #c01c33);"
              : ""}
          >
            {#if isFav}
              <div class="icon-wrap">{@html ICONS.HEART_FILLED}</div>
            {:else}
              <ImageLoader src={pl.cover} alt={pl.title} radius="8px">
                <div slot="fallback" class="icon-fallback">
                  {@html ICONS.PLAYLISTS}
                </div>
              </ImageLoader>
            {/if}
            <div class="play-overlay">
              <span class="overlay-icon">{@html ICONS.PLAY}</span>
            </div>
          </div>
          <div class="card-title">{pl.title}</div>
          {#if pl.trackCount}<div class="card-sub">
              {pl.trackCount} tracks
            </div>{/if}
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  @import "./MusicViews.css";

  .card-img-container.is-vibe {
    background: linear-gradient(135deg, #ffcc00, #ff3333);
  }
  .card-title.center {
    text-align: center;
  }

  .pulse-anim :global(svg) {
    animation: pulse-scale 2s infinite ease-in-out;
  }
  @keyframes pulse-scale {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.8;
    }
  }

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

  .music-card .card-img-container {
    background-color: var(--c-bg-placeholder);
  }
</style>
