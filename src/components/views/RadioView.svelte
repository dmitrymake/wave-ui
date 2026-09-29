<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { MOTION } from "../../lib/transitions";
  import SkeletonGrid from "../SkeletonGrid.svelte";
  import {
    stations,
    currentSong,
    status,
    isLoadingRadio,
  } from "../../lib/store";
  import { playStation } from "../../lib/playerActions";
  import { getStationImageUrl } from "../../lib/radio";
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import MediaCard from "../MediaCard.svelte";
  import Skeleton from "../Skeleton.svelte";
  import Input from "../ui/Input.svelte";
  import { bitrateLabel } from "../../lib/format";

  let searchTerm = $state("");

  let filteredStations = $derived($stations.filter((s) => {
    const q = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.genre && s.genre.toLowerCase().includes(q))
    );
  }));

  let qualityLabel = $derived(bitrateLabel($status.bitrate) || $status.format || "");
</script>

<div class="view-container scrollable" in:fade={{ duration: MOTION.fast }}>
  <div class="content-padded no-bottom-pad">
    <div class="search-wrap">
      <Input
        search
        bind:value={searchTerm}
        placeholder="Find station…"
        ariaLabel="Find station"
      >
        {#snippet icon()}
          {@html ICONS.SEARCH}
        {/snippet}
      </Input>
    </div>
  </div>

  <div class="content-padded">
    {#if $isLoadingRadio}
      <SkeletonGrid count={12} skeletonCard={false} subtitleWidth="40%" titleWidth="70%" />
    {:else}
      <div class="music-grid">
        {#each filteredStations as station (station.file || station.name)}
          {@const streamUrl = station.file}
          {@const isActive =
            $currentSong.stationName === station.name ||
            $currentSong.file === streamUrl}
          {@const imgUrl = getStationImageUrl(station)}

          <MediaCard
            title={station.name}
            active={isActive}
            playable={!isActive}
            onactivate={() => playStation(station)}
          >
            {#snippet cover()}
              <ImageLoader src={imgUrl ?? ""} alt={station.name} radius="var(--radius-md)">
                {#snippet fallback()}
                  <!-- The radio glyph, not a colour emoji (📻 drew a platform
                       picture in a product of 1.5px line icons). -->
                  <div class="icon-fallback">{@html ICONS.RADIO}</div>
                {/snippet}
              </ImageLoader>
            {/snippet}
            {#snippet coverExtra()}
              <!-- The shared badge in its on-artwork form: opaque so it reads on
                   any logo, the live dot when it is playing. It was a glowing
                   accent slab of 10px tracked caps. -->
              {#if isActive}
                {#if $status.state === "play"}
                  <span class="badge badge--solid badge--accent badge--live">Playing</span>
                {:else}
                  <span class="badge badge--solid">Paused</span>
                {/if}
              {/if}
            {/snippet}
            {#snippet sub()}
              {#if station.genre}
                <div class="card-sub">{station.genre}</div>
              {/if}

              {#if isActive && qualityLabel}
                <span class="badge badge--sm" in:fade={{ duration: MOTION.fast }}>{qualityLabel}</span>
              {/if}
            {/snippet}
          </MediaCard>
        {/each}
      </div>

      {#if filteredStations.length === 0 && $stations.length > 0}
        <div class="empty-text">No stations found</div>
      {/if}
    {/if}
  </div>
</div>

<style>

  /* The gap between the field and the first row: the GROUP gap, the same 24px
     the library, the search view and the (hand-rolled) playlists field use. It
     was 20px here, so switching from Library to Radio moved the grid 4px. */
  .search-wrap {
    margin-bottom: var(--space-5);
  }

  /* ---- Phone only: 800px would match the Pi screen and move its grid. ---- */
  @media (max-width: 768px) {
    .search-wrap {
      margin-bottom: var(--space-6);
    }
  }

  /* .status-badge is GONE — the station status is the shared .badge
     (--solid for artwork), see shared.css. */

</style>
