<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 dmitrymake -->
<script lang="ts">
  import MediaCard from "../../MediaCard.svelte";
  import ImageLoader from "../../ImageLoader.svelte";
  import { ICONS } from "../../../lib/icons";
  import { horizontalWheelScroll } from "../../../lib/horizontalScroll";
  import type { YoutubeCard } from "../../../lib/types/youtube";
  import { countLabel } from "../../../lib/format";
  let { cards, onopen }: { cards: YoutubeCard[]; onopen: (card: YoutubeCard) => void } = $props();
</script>

<div class="music-grid horizontal section-mb" onwheel={horizontalWheelScroll}>
  {#each cards as card (card.kind + card.id)}
    {@const favorite = card.kind === "playlist" && card.id === "LM"}
    <MediaCard title={favorite ? "Favorites" : card.title} playable={card.kind !== "artist"}
      coverStyle={favorite ? "background: var(--grad-favorites);" : ""} onactivate={() => onopen(card)}>
      {#snippet cover()}
        {#if favorite}
          <div class="icon-wrap">{@html ICONS.HEART_FILLED}</div>
        {:else}
          <ImageLoader src={card.image ?? ""} alt={card.title} radius="var(--radius-md)">
            {#snippet fallback()}<div class="icon-fallback">{@html card.kind === "artist" ? ICONS.ARTISTS : ICONS.PLAYLISTS}</div>{/snippet}
          </ImageLoader>
        {/if}
      {/snippet}
      {#snippet sub()}<div class="card-sub">{favorite ? typeof card.trackCount === "number" ? countLabel(card.trackCount, "track") : "Playlist" : card.subtitle || card.kind.charAt(0).toUpperCase() + card.kind.slice(1)}</div>{/snippet}
    </MediaCard>
  {/each}
</div>
