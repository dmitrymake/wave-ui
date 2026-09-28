<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
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

  let searchTerm = $state("");

  let filteredStations = $derived($stations.filter((s) => {
    const q = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.genre && s.genre.toLowerCase().includes(q))
    );
  }));

  let qualityLabel = $derived($status.bitrate
    ? `${$status.bitrate} kbps`
    : $status.format || "");
</script>

<div class="view-container scrollable" in:fade={{ duration: 200 }}>
  <div class="content-padded no-bottom-pad">
    <div class="search-wrap">
      <Input
        search
        bind:value={searchTerm}
        placeholder="Find station..."
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
                  <div class="icon-fallback">📻</div>
                {/snippet}
              </ImageLoader>
            {/snippet}
            {#snippet coverExtra()}
              {#if isActive}
                {#if $status.state === "play"}
                  <div class="status-badge playing">PLAYING</div>
                {:else}
                  <div class="status-badge paused">PAUSED</div>
                {/if}
              {/if}
            {/snippet}
            {#snippet sub()}
              {#if station.genre}
                <div class="card-sub">{station.genre}</div>
              {/if}

              {#if isActive && qualityLabel}
                <div class="card-badge quality" in:fade>
                  {qualityLabel}
                </div>
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

  .status-badge {
    font-size: var(--text-2xs);
    font-weight: var(--weight-bold);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--c-text-primary);
    letter-spacing: var(--tracking-wide);
    z-index: 5;
  }

  .status-badge.playing {
    background: var(--c-accent);
    box-shadow: var(--shadow-glow);
  }

  .status-badge.paused {
    background: var(--c-bg-toast);
    border: var(--border-default);
    color: var(--c-text-secondary);
  }

</style>
