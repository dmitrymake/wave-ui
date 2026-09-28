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

  // While the toggle is in flight the button is inert: a double tap used to fire
  // two requests, and the optimistic rollback of the first one then clobbered
  // the second, leaving the heart out of sync with the server.
  let pending = $state(false);

  async function handleClick(e: MouseEvent) {
    e.stopPropagation();
    // Single source of truth for the like/unlike flow (optimistic update + rollback
    // for Yandex, MPD favourite toggle otherwise) lives in playerHelpers.toggleLike.
    if (!track || pending) return;
    pending = true;
    try {
      await toggleLike(track);
    } finally {
      pending = false;
    }
  }
</script>

<button
  class="btn-icon like-btn {className}"
  class:liked
  class:compact
  onclick={handleClick}
  disabled={pending}
  aria-label={liked ? `Unlike ${track.title || "this track"}` : `Like ${track.title || "this track"}`}
  aria-pressed={liked}
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

  /* Row variant: 6px pad + a 20px glyph = a 32px target, which is under the
     44px tap minimum — and this button is in EVERY row, so a miss is a miss on
     every row. The fix is the target, not the picture: min-width/min-height grow
     the tappable box to 40px while the heart keeps the 20px glyph it always had
     (growing the glyph to 24px made it read as a big blob in the row). */
  .compact {
    padding: var(--icon-btn-pad-sm);
    min-width: var(--control-h-lg);
    min-height: var(--control-h-lg);
  }
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
