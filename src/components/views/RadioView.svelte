<script>
  import { fade } from "svelte/transition";
  import {
    stations,
    currentSong,
    status,
    isLoadingRadio,
  } from "../../lib/store";
  import * as MPD from "../../lib/mpd";
  import { getStationImageUrl } from "../../lib/utils";
  import { ICONS } from "../../lib/icons";
  import ImageLoader from "../ImageLoader.svelte";
  import Skeleton from "../Skeleton.svelte";

  let searchTerm = "";

  $: filteredStations = $stations.filter((s) => {
    const q = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.genre && s.genre.toLowerCase().includes(q))
    );
  });

  $: qualityLabel = $status.bitrate
    ? `${$status.bitrate} kbps`
    : $status.format || "";
</script>

<div
  class="view-container scrollable content-padded"
  in:fade={{ duration: 200 }}
>
  <div class="search-input-container">
    <span class="search-icon">
      {@html ICONS.SEARCH}
    </span>
    <input type="text" placeholder="Find station..." bind:value={searchTerm} />
  </div>

  {#if $isLoadingRadio}
    <div class="music-grid">
      {#each Array(12) as _}
        <div class="music-card">
          <div class="skeleton-img">
            <Skeleton width="100%" height="100%" />
          </div>
          <Skeleton width="70%" height="16px" />
        </div>
      {/each}
    </div>
  {:else}
    <div class="music-grid">
      {#each filteredStations as station}
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
          on:click={() => MPD.playStation(station)}
        >
          <div class="card-img-container">
            <ImageLoader
              src={imgUrl}
              alt={station.name}
              radius="var(--radius-md)"
            >
              <div slot="fallback" class="icon-fallback">📻</div>
            </ImageLoader>

            {#if isActive && qualityLabel}
              <div class="quality-badge overlay-pos" in:fade>
                {qualityLabel}
              </div>
            {/if}

            <div class="play-overlay">
              {#if isActive}
                {#if $status.state === "play"}
                  <div class="status-badge playing">PLAYING</div>
                {:else}
                  <div class="status-badge paused">PAUSED</div>
                {/if}
              {:else}
                <span class="play-icon-wrap">{@html ICONS.PLAY}</span>
              {/if}
            </div>
          </div>

          <div class="card-title text-ellipsis">
            {station.name}
          </div>
          {#if station.genre}
            <div class="card-sub text-ellipsis">{station.genre}</div>
          {/if}
        </div>
      {/each}
    </div>

    {#if filteredStations.length === 0 && $stations.length > 0}
      <div class="empty-state-container">
        <div class="empty-state-icon">🔍</div>
        <div>No stations found</div>
      </div>
    {/if}
  {/if}
</div>

<style>
  @import "./MusicViews.css";

  .skeleton-img {
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    margin-bottom: 12px;
    overflow: hidden;
    background: var(--c-surface-drag-phantom);
  }

  .quality-badge.overlay-pos {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 5;
    background: var(--c-bg-glass);
    backdrop-filter: blur(4px);
    border-color: var(--c-border-dim);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .play-icon-wrap {
    width: 48px;
    color: var(--c-text-primary);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  }

  .status-badge {
    font-size: 10px;
    font-weight: 800;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    color: var(--c-text-primary);
    letter-spacing: 0.5px;
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

  .card-title {
    color: var(--c-text-primary);
    font-weight: 600;
    font-size: 14px;
    margin-top: 8px;
  }

  .card-sub {
    color: var(--c-text-secondary);
    font-size: 12px;
    margin-top: 2px;
  }
</style>
