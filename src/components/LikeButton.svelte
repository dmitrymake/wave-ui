<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import type { Track } from "../lib/types";
  import { ICONS } from "../lib/icons";
  import { favorites } from "../lib/store.js";
  import { yandexFavorites } from "../lib/stores/yandex";
  import { isTrackLiked, toggleLike } from "../lib/playerHelpers";

  interface Props {
    track: Track;
    compact?: boolean;
    class?: string;
  }

  let { track, compact = false, class: className = "" }: Props = $props();

  let liked = $derived(isTrackLiked(track, $favorites, $yandexFavorites));

  async function handleClick(e: MouseEvent) {
    e.stopPropagation();
    // Single source of truth for the like/unlike flow (optimistic update + rollback
    // for Yandex, MPD favourite toggle otherwise) lives in playerHelpers.toggleLike.
    if (!track) return;
    await toggleLike(track);
  }
</script>

<button
  class="btn-icon like-btn {className}"
  class:liked
  class:compact
  onclick={handleClick}
>
  {@html liked ? ICONS.HEART_FILLED : ICONS.HEART}
</button>

<style>
  .like-btn {
    padding: 10px;
    color: var(--c-text-secondary);
    transition: color 0.2s;
  }
  .like-btn:active { opacity: 0.7; }
  .like-btn.liked { color: var(--c-heart); }
  .like-btn :global(svg) { width: 24px; height: 24px; }

  .compact { padding: 6px; }
  .compact :global(svg) { width: 20px; height: 20px; }
</style>
