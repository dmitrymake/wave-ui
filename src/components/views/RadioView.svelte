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
    <div class="search-input-container">
      <span class="search-icon">
        {@html ICONS.SEARCH}
      </span>
      <input
        type="text"
        placeholder="Find station..."
        bind:value={searchTerm}
      />
    </div>
  </div>

  <div class="content-padded">
    {#if $isLoadingRadio}
      <div class="music-grid">
        {#each Array(12) as _}
          <div class="music-card">
            <div class="card-img-container">
              <Skeleton width="100%" height="100%" radius="8px" />
            </div>
            <div style="margin-bottom: 4px;">
              <Skeleton width="70%" height="15px" radius="4px" />
            </div>
            <div>
              <Skeleton width="40%" height="13px" radius="4px" style="opacity: 0.6" />
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
              <ImageLoader src={imgUrl ?? ""} alt={station.name} radius="8px">
                {#snippet fallback()}
                  <div class="icon-fallback">📻</div>
                {/snippet}
              </ImageLoader>

              <div class="play-overlay" style={isActive ? "opacity: 1" : ""}>
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

  .search-input-container {
    display: flex;
    align-items: center;
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 20px;
    width: 100%;
    box-sizing: border-box;
  }

  .search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-text-muted);
    margin-right: 10px;
    flex-shrink: 0;
  }
  .search-icon :global(svg) {
    width: 18px;
    height: 18px;
  }

  input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    font-size: 15px;
    outline: none;
    min-width: 0;
    padding: 0;
  }
  input::placeholder {
    color: var(--c-text-muted);
  }

  .status-badge {
    font-size: 10px;
    font-weight: 800;
    padding: 6px 12px;
    border-radius: 4px;
    color: var(--c-text-primary);
    letter-spacing: 0.5px;
    z-index: 5;
  }

  .status-badge.playing {
    background: var(--c-accent);
    box-shadow: 0 0 10px var(--c-shadow-glow-accent);
  }

  .status-badge.paused {
    background: var(--c-bg-toast);
    border: 1px solid var(--c-border);
    color: var(--c-text-secondary);
  }

  .empty-text {
    grid-column: 1/-1;
    text-align: center;
    padding: 40px;
    opacity: 0.5;
  }
</style>
