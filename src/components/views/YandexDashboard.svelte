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
    class="music-grid horizontal section-mb vibe-grid"
    onwheel={handleHorizontalScroll}
  >
    {#each vibeCards as item}
      <MediaCard
        title={item.title}
        titleCenter
        coverStyle={coverStyle(item)}
        onactivate={() => openPlaylist(item)}
      >
        {#snippet cover()}
          {#if item.kind === "my_vibe"}
            <div class="icon-wrap is-vivid">{@html ICONS.RADIO}</div>
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

  /* The icon that stands in for a cover. ONE definition, shared with
     PlaylistGrid / PlaylistSearchResults: 30% of the square, glyph fills it, and
     the app's soft white. These two views had a second copy at
     width/height:100% with a fixed 40px glyph in --c-text-primary, which is what
     made every Yandex card read as a different app. It is still a local copy
     because MusicViews.css does not own the class yet. */
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

  /* My Vibe is the one cover where the soft white does not work: --grad-vibe is
     --c-warn -> --c-error, i.e. #ffcc00 -> #ff4444 in the default theme and
     #fabd2f -> #fe5b4a in gruvbox, bright at BOTH stops. White measures 1.51:1
     on the yellow stop (unreadable), so the label goes dark here and only here:
     --c-text-inverse is the app's "label on a vivid fill" token (#000 / #282828)
     and measures 13.9:1 -> 6.2:1 across the gradient in BOTH themes.
     Kept as a colour override rather than a second size: a bigger, darker glyph
     on a bright tile is what read as a foreign UI in the first place. */
  .icon-wrap.is-vivid {
    color: var(--c-text-inverse);
  }

  /* Vibe cards centre their title, so the sub line centres with it. :global() —
     MediaCard renders .card-sub-row. */
  .vibe-grid :global(.card-sub-row) {
    justify-content: center;
  }
</style>
