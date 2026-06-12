<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { seek, nav, togglePlay } from "../lib/playerActions";
  import { ICONS } from "../lib/icons";
  import {
    currentSong,
    status,
    isFullPlayerOpen,
    getTrackCoverUrl,
    stations,
    openContextMenu,
    type EventWithDetail,
  } from "../lib/store.js";
  import { longpress } from "../lib/actions";
  import { formatTime, isRadioStream, getQualityLabel } from "../lib/playerHelpers";
  import { createSeekController } from "../lib/seekDrag.svelte";
  import ImageLoader from "./ImageLoader.svelte";
  import VolumeSlider from "./VolumeSlider.svelte";
  import PlayModeButton from "./PlayModeButton.svelte";
  import LikeButton from "./LikeButton.svelte";

  let isHoveringBar = $state(false);
  let progressBar: HTMLElement;

  const stop = (fn: (e: Event) => void) => (e: Event) => {
    e.stopPropagation();
    fn(e);
  };

  let duration = $derived($status.duration > 0 ? $status.duration : 1);
  let elapsed = $derived($status.elapsed || 0);
  let isPlaying = $derived($status.state === "play");
  let isRadio = $derived(isRadioStream($currentSong));
  let displayTitle = $derived($currentSong.title || "Not Playing");
  let displayArtist = $derived($currentSong.stationName || $currentSong.artist || "Moode");
  let artSrc = $derived(getTrackCoverUrl($currentSong, $stations, $currentSong.stationName));

  // The dock keeps mouse drags on `window` so they keep following the cursor
  // outside the thin bar.
  const seekCtl = createSeekController({
    getElement: () => progressBar,
    getDuration: () => duration,
    getElapsed: () => elapsed,
    getIsRadio: () => isRadio,
    seekTo: seek,
    windowMouse: true,
  });

  let isDragging = $derived(seekCtl.isDragging);
  let pct = $derived(seekCtl.fraction * 100);
  let smooth = $derived(isPlaying && !isDragging && !isRadio);
  let qualityLabel = $derived(getQualityLabel($status));

  function handleBarKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (isRadio) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 5 : -5;
      seek(Math.max(0, Math.min(duration, elapsed + delta)));
    }
  }

  // Clean up window listeners if the dock unmounts mid-drag (e.g. full player opens).
  onDestroy(() => {
    seekCtl.destroy();
  });

  function handleContext(e: MouseEvent) {
    e.stopPropagation();
    openContextMenu(e, $currentSong, { type: "general", source: "miniplayer" });
  }

  function handleLongPress(e: CustomEvent<{ originalEvent: Event }>) {
    openContextMenu(e.detail.originalEvent as EventWithDetail, $currentSong, { type: "general", source: "miniplayer" });
  }
</script>

{#if !$isFullPlayerOpen}
  <div
    class="dock"
    onclick={() => isFullPlayerOpen.set(true)}
    use:longpress={500}
    onlongpress={handleLongPress}
    role="button"
    tabindex="0"
    onkeydown={(e) => { if (e.key === "Enter") isFullPlayerOpen.set(true); }}
  >
    <div
      class="progress-shadow"
      style="width: {pct}%; transition: {smooth ? 'width 0.25s linear' : 'none'}"
    ></div>

    <div
      class="progress-bar"
      class:radio={isRadio}
      bind:this={progressBar}
      onmouseenter={() => (isHoveringBar = true)}
      onmouseleave={() => (isHoveringBar = false)}
      onmousedown={(e) => { e.stopPropagation(); seekCtl.onMouseDown(e); }}
      ontouchstart={(e) => { e.stopPropagation(); seekCtl.onTouchStart(e); }}
      ontouchmove={seekCtl.onTouchMove}
      ontouchend={seekCtl.onTouchEnd}
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleBarKey}
      role="slider"
      aria-label="Playback progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      tabindex="0"
    >
      <div class="rail"></div>
      <div
        class="fill"
        style="width: {pct}%; transition: {smooth ? 'width 0.25s linear' : 'none'}"
      >
        {#if !isRadio}<div class="knob"></div>{/if}
      </div>

      {#if (isHoveringBar || isDragging) && !isRadio}
        <div class="tooltip current" style="left: {pct}%">
          {formatTime(seekCtl.displaySeconds)}
        </div>
        <span></span>
      {/if}
    </div>

    <div class="grid">
      <div class="info">
        <div class="art">
          <ImageLoader src={artSrc} alt="art" radius="4px">
            {#snippet fallback()}
              <div class="icon-fallback">
                {@html isRadio ? ICONS.RADIO : ICONS.ALBUMS}
              </div>
            {/snippet}
          </ImageLoader>
        </div>

        <div class="meta">
          <div class="title-row">
            <div class="title text-ellipsis" title={displayTitle}>
              {displayTitle}
            </div>
            <button class="btn-icon tiny-dots" onclick={handleContext}>
              {@html ICONS.DOTS}
            </button>
          </div>
          <div class="artist-row">
            <div class="artist text-ellipsis" title={displayArtist}>
              {displayArtist}
            </div>
            {#if qualityLabel}
              <span class="meta-tag quality">{qualityLabel}</span>
            {/if}
          </div>
        </div>
      </div>

      <div class="controls">
        <LikeButton track={$currentSong} compact class="desktop" />

        <button class="btn-icon" onclick={stop(() => nav("previous"))}>
          {@html ICONS.PREVIOUS}
        </button>

        <button class="play-btn flex-center" onclick={stop(togglePlay)}>
          {@html $status.state === "play" ? ICONS.PAUSE : ICONS.PLAY}
        </button>

        <button class="btn-icon" onclick={stop(() => nav("next"))}>
          {@html ICONS.NEXT}
        </button>

        {#if !isRadio}
          <PlayModeButton compact class="desktop" />
        {/if}
      </div>

      <div class="volume desktop">
        <VolumeSlider compact />
      </div>
    </div>
  </div>
{/if}

<style>
  .dock {
    position: fixed; bottom: 0; left: 0; right: 0;
    height: var(--mini-player-height, 90px);
    background: var(--c-bg-glass);
    border-top: 1px solid var(--c-border-dim);
    z-index: var(--z-dock);
    backdrop-filter: blur(10px);
    cursor: pointer; user-select: none;
  }

  .progress-shadow {
    position: absolute; top: 0; left: 0; bottom: 0;
    background: var(--c-surface-button); z-index: 101;
    pointer-events: none; opacity: 0.1;
  }

  .progress-bar {
    position: absolute; top: -6px; left: 0; width: 100%;
    height: 14px; z-index: 110; cursor: pointer;
    display: flex; align-items: center;
  }
  .progress-bar.radio { cursor: default; opacity: 0; pointer-events: none; }

  .rail {
    position: absolute; left: 0; width: 100%; top: 6px;
    height: 2px; background: var(--c-border); transition: height 0.2s;
  }
  .fill {
    position: absolute; left: 0; top: 6px; height: 2px;
    background: var(--c-accent); pointer-events: none;
  }
  .progress-bar:hover .rail, .progress-bar:hover .fill { height: 4px; top: 5px; }
  .knob {
    position: absolute; right: -6px; top: -4px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--c-text-primary); transform: scale(0);
    transition: transform 0.2s; box-shadow: 0 1px 3px var(--c-black-50);
  }
  .progress-bar:hover .knob { transform: scale(1); }

  .tooltip {
    position: absolute; top: -28px;
    background: var(--c-surface-active); color: var(--c-text-primary);
    font-size: 11px; font-weight: bold; padding: 3px 6px;
    border-radius: 4px; transform: translateX(-50%);
    pointer-events: none; box-shadow: 0 2px 5px var(--c-shadow-card);
  }

  .grid {
    display: grid; grid-template-columns: 1fr max-content 1fr;
    height: 100%; padding: 0 32px; align-items: center;
    gap: 20px; position: relative; z-index: 105;
  }

  .info { display: flex; align-items: center; gap: 16px; overflow: hidden; }
  .art {
    width: 64px; height: 64px; border-radius: 4px;
    background: var(--c-bg-placeholder); overflow: hidden;
    flex-shrink: 0; position: relative;
  }
  .icon-fallback {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    color: var(--c-icon-faint);
  }
  .icon-fallback :global(svg) { width: 24px; height: 24px; opacity: 0.5; }

  .meta { display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
  .title-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
  .title { font-size: 15px; font-weight: 500; color: var(--c-text-primary); }
  .artist-row { display: flex; align-items: center; gap: 6px; }
  .artist { font-size: 13px; color: var(--c-text-secondary); }

  .tiny-dots {
    width: 28px; height: 28px; min-width: 28px; padding: 0;
    border-radius: 50%; color: var(--c-text-secondary);
    background: transparent; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; opacity: 0.7;
  }
  .tiny-dots:hover { color: var(--c-text-primary); background: var(--c-white-10); opacity: 1; }

  .controls { display: flex; align-items: center; gap: 20px; }

  .play-btn {
    width: 48px; height: 48px; border-radius: 50%;
    background: var(--c-text-primary); color: var(--c-text-inverse);
    box-shadow: 0 4px 12px var(--c-shadow-card);
    transition: transform 0.1s; border: none;
  }
  .play-btn:hover { transform: scale(1.05); }
  .play-btn:active { transform: scale(0.95); }
  .play-btn :global(svg) { width: 24px; height: 24px; }

  .volume { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }

  @media (max-width: 768px) {
    .desktop { display: none !important; }
    .grid { grid-template-columns: 1fr max-content; padding: 0 16px; }
    .play-btn { width: 40px; height: 40px; }
    .art { width: 48px; height: 48px; }
    .tiny-dots { display: none; }
    .meta-tag { display: none; }
  }
</style>
