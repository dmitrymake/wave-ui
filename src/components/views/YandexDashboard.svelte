<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import MediaCard from "../MediaCard.svelte";
  import SkeletonGrid from "../SkeletonGrid.svelte";
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

  /** Cover tint of a card: My Vibe carries the app's vibe gradient, a station
      carries the colour Yandex gave it. Same mechanism as the favourites
      gradient below, so no cover class is needed. */
  function coverStyle(item: YandexPlaylist): string {
    if (item.kind === "my_vibe") return "background: var(--grad-vibe);";
    return item.bgColor ? `background: ${item.bgColor}` : "";
  }

  /** Every cover here is Yandex's own brand art — a flat ground and a disc —
      which MusicViews.css crops and scrims (`.yandex-art`) so the row reads as
      artwork instead of a row of buttons. Set on every card in this view
      because every card in it is brand art; the album/artist covers elsewhere
      in the Yandex views are photographs and deliberately do not get it. */
  const ART_CLASS = "yandex-art";

  /** The sub line under a card title. Stations say what they are (they have no
      count); My Vibe is the personal station, the rest are themed ones. */
  function vibeSub(item: YandexPlaylist): string {
    return item.kind === "my_vibe" ? "Personal radio" : "Radio station";
  }

  /** The sub line of a collection card. `trackCount` is a number from the API,
      except on favourites where YandexView parks the "♥" sentinel until the
      likes list has been counted — that must never reach the screen as text. */
  function collectionSub(pl: YandexPlaylist): string {
    if (typeof pl.trackCount === "number") return `${pl.trackCount} tracks`;
    if (pl.kind === "favorites") return "Liked tracks";
    return "Playlist";
  }
</script>

{#if isLoading && vibeCards.length === 0}
  <SkeletonGrid count={4} layout="horizontal" skeletonCard={false} heading="Vibes" headingWidth="100px" subtitleWidth="40%" />
  <SkeletonGrid count={4} layout="horizontal" skeletonCard={false} heading="Collection & Mixes" headingWidth="150px" subtitleWidth="40%" />
{:else}
  <h2 class="header-label">Vibes</h2>
  <div
    class="music-grid horizontal section-mb identity-grid"
    onwheel={handleHorizontalScroll}
  >
    {#each vibeCards as item}
      <MediaCard
        title={item.title}
        titleCenter
        coverClass={ART_CLASS}
        coverStyle={coverStyle(item)}
        onactivate={() => openPlaylist(item)}
      >
        {#snippet cover()}
          {#if item.kind === "my_vibe"}
            <div class="icon-wrap">{@html ICONS.RADIO}</div>
          {:else if item.cover}
            <ImageLoader
              src={item.cover}
              alt={item.title}
              radius="var(--radius-md)"
            >
              {#snippet fallback()}
                <div class="icon-wrap">{@html ICONS.RADIO}</div>
              {/snippet}
            </ImageLoader>
          {:else}
            <div class="icon-wrap">{@html ICONS.RADIO}</div>
          {/if}
        {/snippet}
        {#snippet sub()}
          <div class="card-sub">{vibeSub(item)}</div>
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
          coverClass={ART_CLASS}
          coverStyle={isFav ? "background: var(--grad-favorites);" : ""}
          onactivate={() => openPlaylist(pl)}
        >
          {#snippet cover()}
            {#if isFav}
              <div class="icon-wrap">{@html ICONS.HEART_FILLED}</div>
            {:else if pl.cover}
              <ImageLoader src={pl.cover} alt={pl.title} radius="var(--radius-md)">
                {#snippet fallback()}
                  <div class="icon-wrap">{@html ICONS.PLAYLISTS}</div>
                {/snippet}
              </ImageLoader>
            {:else}
              <div class="icon-wrap">{@html ICONS.PLAYLISTS}</div>
            {/if}
          {/snippet}
          {#snippet sub()}
            <div class="card-sub">{collectionSub(pl)}</div>
          {/snippet}
        </MediaCard>
      {/each}
    </div>
  {/if}
{/if}

<style>

  /* The glyph on a tinted cover and the treatment on Yandex's brand art are
     both MusicViews.css rules now (.icon-wrap, .yandex-art) — this view only
     says WHICH cards they apply to. Before, the emblem was restated here at
     30% with a 40px glyph in --c-text-primary, and that local copy is what
     made the Yandex cards read as another app: the same role drawn twice, at
     two sizes, in two colours. */


  /* Vibes are IDENTITY cards: the title is centred, so the sub line centres with
     it. :global() — MediaCard renders .card-sub-row, and this view is the only
     one that centres it. */
  .identity-grid :global(.card-sub-row) {
    justify-content: center;
  }
</style>
