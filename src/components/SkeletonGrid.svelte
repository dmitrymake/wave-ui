<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<!--
  SkeletonGrid — the loading state of a media card grid.

  Replaces six near-identical copies of "N skeleton .music-cards" that had
  drifted apart (raw px radii, a duplicated 15-line block inside
  YandexDashboard, two different `margin-bottom` values). One markup, one set
  of tokens, and the horizontal variant the Yandex dashboard needs.
-->
<script lang="ts">
  import Skeleton from "./Skeleton.svelte";

  let {
    count = 12,
    /** "grid" = responsive card grid, "horizontal" = swipeable row. */
    layout = "grid",
    /** Extra class on the container (e.g. playlists-grid-override). */
    gridClass = "",
    /** .skeleton-card suppresses the hover lift while the real grid loads. */
    skeletonCard = true,
    /** Optional section heading; when set it renders as a skeleton too. */
    heading = "",
    headingWidth = "100px",
    titleWidth = "80%",
    subtitleWidth = "50%",
  }: {
    count?: number;
    layout?: "grid" | "horizontal";
    gridClass?: string;
    skeletonCard?: boolean;
    heading?: string;
    headingWidth?: string;
    titleWidth?: string;
    subtitleWidth?: string;
  } = $props();
</script>

{#if heading}
  <h2 class="header-label"><Skeleton width={headingWidth} height="20px" /></h2>
{/if}
<div class="music-grid" class:horizontal={layout === "horizontal"} class:section-mb={Boolean(heading)}>
  {#each Array(count) as _}
    <div class="music-card" class:skeleton-card={skeletonCard}>
      <div class="card-img-container">
        <Skeleton width="100%" height="100%" radius="var(--radius-md)" />
      </div>
      <div class="sk-title">
        <Skeleton width={titleWidth} height="15px" radius="var(--radius-sm)" />
      </div>
      <div>
        <Skeleton
          width={subtitleWidth}
          height="13px"
          radius="var(--radius-sm)"
          style="opacity: var(--opacity-muted)"
        />
      </div>
    </div>
  {/each}
</div>

<style>
  .sk-title {
    margin: var(--space-3) 0 var(--space-1);
  }

  /* The skeleton is a placeholder, not a target: no lift, no hover, and the
     cover keeps its square aspect so the grid does not reflow when the real
     cards arrive. */
  .music-card.skeleton-card:hover {
    background: transparent;
  }

  .music-card.skeleton-card .card-img-container {
    aspect-ratio: 1;
    background: transparent;
    margin-bottom: var(--space-0);
  }
</style>
