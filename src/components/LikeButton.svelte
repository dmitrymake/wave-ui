<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import type { Track } from "../lib/types";
  import { ICONS } from "../lib/icons";
  import { favorites } from "../lib/store.js";
  import { isTrackLiked, toggleLike, sourceLikesVersion } from "../lib/playerHelpers";
  import IconButton from "./ui/IconButton.svelte";

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

<!-- compact == the row/dock heart: a 20px glyph in the primitive's 40px target.
     The glyph is the smaller one on purpose — growing it to 24px made it read as
     a blob in a row, while the target (not the picture) is what a miss costs. -->
<IconButton
  class={className}
  size={compact ? "md" : "lg"}
  tone="heart"
  active={liked}
  disabled={pending}
  ariaLabel={liked ? `Unlike ${track.title || "this track"}` : `Like ${track.title || "this track"}`}
  icon={liked ? ICONS.HEART_FILLED : ICONS.HEART}
  onclick={handleClick}
/>
