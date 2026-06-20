<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import type { Track } from "../lib/types";
  import { ICONS } from "../lib/icons";
  import { favorites } from "../lib/store.js";
  import { isTrackLiked, toggleLike, sourceLikesVersion } from "../lib/playerHelpers";

  interface Props {
    track: Track;
    compact?: boolean;
    class?: string;
  }

  let { track, compact = false, class: className = "" }: Props = $props();

  // Like state is resolved source-agnostically by playerHelpers.isTrackLiked (it picks
  // the owning TrackSource and reads its live favourites). $favorites and the generic
  // $sourceLikesVersion bump are referenced only as reactivity triggers so this derived
  // re-runs when the local favourites or any streaming source's likes change — no
  // concrete streaming store is named in this generic component.
  let liked = $derived.by(() => {
    void $sourceLikesVersion;
    return isTrackLiked(track, $favorites);
  });

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
    padding: var(--icon-btn-pad-lg);
    color: var(--c-text-secondary);
    transition: color var(--dur-fast);
  }
  .like-btn:active { opacity: var(--opacity-dim); }
  .like-btn.liked { color: var(--c-heart); }
  .like-btn :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); }
  .like-btn.liked :global(svg) {
    animation: like-pop var(--dur-base) var(--ease-emphasized);
  }

  .compact { padding: var(--icon-btn-pad-sm); }
  .compact :global(svg) { width: var(--icon-size-md); height: var(--icon-size-md); }

  @keyframes like-pop {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); }
  }

  @media (prefers-reduced-motion: reduce) {
    .like-btn.liked :global(svg) {
      animation: none;
    }
  }
</style>
