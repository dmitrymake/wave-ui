<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
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
      <div class="music-grid">
        {#each Array(12) as _}
          <div class="music-card">
            <div class="card-img-container">
              <Skeleton width="100%" height="100%" radius="var(--radius-md)" />
            </div>
            <div style="margin-bottom: var(--space-1);">
              <Skeleton width="70%" height="15px" radius="var(--radius-sm)" />
            </div>
            <div>
              <Skeleton width="40%" height="13px" radius="var(--radius-sm)" style="opacity: var(--opacity-muted)" />
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="music-grid">
        {#each filteredStations as station (station.file || station.name)}
          {@const streamUrl = station.file}
          {@const isActive =
            $currentSong.stationName === station.name ||
            $currentSong.file === streamUrl}
          {@const imgUrl = getStationImageUrl(station)}

          <div
            class="music-card"
            class:is-active={isActive}
            role="button"
            tabindex="0"
            onclick={() => playStation(station)}
            onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playStation(station); }}}
          >
            <div class="card-img-container">
              <ImageLoader src={imgUrl ?? ""} alt={station.name} radius="var(--radius-md)">
                {#snippet fallback()}
                  <div class="icon-fallback">📻</div>
                {/snippet}
              </ImageLoader>

              <div class="play-overlay" style={isActive ? "opacity: var(--opacity-visible)" : ""}>
                {#if isActive}
                  {#if $status.state === "play"}
                    <div class="status-badge playing">PLAYING</div>
                  {:else}
                    <div class="status-badge paused">PAUSED</div>
                  {/if}
                {:else}
                  <span class="overlay-icon">{@html ICONS.PLAY}</span>
                {/if}
              </div>
            </div>

            <div class="card-title">{station.name}</div>

            <div class="card-sub-row">
              {#if station.genre}
                <div class="card-sub">{station.genre}</div>
              {/if}

              {#if isActive && qualityLabel}
                <div class="card-badge quality" in:fade>
                  {qualityLabel}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if filteredStations.length === 0 && $stations.length > 0}
        <div class="empty-text">No stations found</div>
      {/if}
    {/if}
  </div>
</div>

<style>

  .search-wrap {
    margin-bottom: var(--space-5);
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

  .empty-text {
    grid-column: 1/-1;
    text-align: center;
    padding: var(--space-10);
    opacity: var(--opacity-faint);
  }
</style>
