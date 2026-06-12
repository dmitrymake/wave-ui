<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import ImageLoader from "./ImageLoader.svelte";
  import { ICONS } from "../lib/icons";
  import { stations, getTrackThumbUrl, getTrackCoverUrl } from "../lib/store.js";
  import type { Track } from "../lib/types";

  let {
    track,
    isRadio = false,
    alt = "",
  }: { track: Track; isRadio?: boolean; alt?: string } = $props();

  // imgError lives in this child so a keyed remount (new track / enriched thumb)
  // resets it naturally — no state-syncing $effect needed in the parent row.
  let imgError = $state(false);
  let imgUrl = $derived(
    imgError
      ? getTrackCoverUrl(track, $stations, null)
      : getTrackThumbUrl(track, "sm", $stations, null),
  );
</script>

<ImageLoader src={imgUrl} {alt} radius="4px" onError={() => (imgError = true)}>
  {#snippet fallback()}
    <div class="icon-ph" in:fade>
      {@html isRadio ? ICONS.RADIO : ICONS.ALBUMS}
    </div>
  {/snippet}
</ImageLoader>

<style>
  .icon-ph {
    color: var(--c-icon-faint);
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-ph :global(svg) {
    width: 20px;
    height: 20px;
  }
</style>
