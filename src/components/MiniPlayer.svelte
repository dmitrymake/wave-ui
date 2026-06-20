<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { sendArt, receiveArt } from "../lib/transitions";
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
  import IconButton from "./ui/IconButton.svelte";

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
    transition:fade={{ duration: 220 }}
    onclick={() => isFullPlayerOpen.set(true)}
    use:longpress={500}
    onlongpress={handleLongPress}
    role="button"
    tabindex="0"
    onkeydown={(e) => { if (e.key === "Enter") isFullPlayerOpen.set(true); }}
  >
    <div
      class="progress-shadow"
      style="transform: scaleX({pct / 100}); transition: {smooth ? 'transform var(--dur-slow-2) var(--ease-linear)' : 'none'}"
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
        style="transform: scaleX({pct / 100}); transition: {smooth ? 'transform var(--dur-slow-2) var(--ease-linear)' : 'none'}"
      ></div>
      {#if !isRadio}
        <div
          class="knob"
          style="left: {pct}%; transition: transform var(--dur-fast){smooth ? ', left var(--dur-slow-2) var(--ease-linear)' : ''}"
        ></div>
      {/if}

      {#if (isHoveringBar || isDragging) && !isRadio}
        <div class="tooltip current" style="left: {pct}%">
          {formatTime(seekCtl.displaySeconds)}
        </div>
        <span></span>
      {/if}
    </div>

    <div class="grid">
      <div class="info">
        <div
          class="art"
          in:receiveArt|global={{ key: "np-art" }}
          out:sendArt|global={{ key: "np-art" }}
        >
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

        <IconButton ariaLabel="Previous" onclick={stop(() => nav("previous"))}>
          {@html ICONS.PREVIOUS}
        </IconButton>

        <button class="play-btn flex-center" onclick={stop(togglePlay)}>
          {@html $status.state === "play" ? ICONS.PAUSE : ICONS.PLAY}
        </button>

        <IconButton ariaLabel="Next" onclick={stop(() => nav("next"))}>
          {@html ICONS.NEXT}
        </IconButton>

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
    position: fixed; bottom: var(--space-0); left: var(--space-0); right: var(--space-0);
    height: var(--mini-player-height);
    /* Opaque (= the glass colour at full alpha) so we can drop the persistent
       backdrop-filter blur — it ran a 2-pass gaussian over the scrolling content
       every frame for the whole session, invisibly under a ~0.95-opaque bar. */
    background: var(--c-bg-main);
    border-top: var(--border-default-dim);
    z-index: var(--z-dock);
    cursor: pointer; user-select: none;
  }

  .progress-shadow {
    position: absolute; top: var(--space-0); left: var(--space-0); bottom: var(--space-0);
    width: 100%; transform-origin: left center;
    background: var(--c-surface-button); z-index: 101;
    pointer-events: none; opacity: 0.1;
  }

  .progress-bar {
    position: absolute; top: calc(-1 * var(--space-2xs)); left: var(--space-0); width: 100%;
    height: var(--space-14px); z-index: 110; cursor: pointer;
    display: flex; align-items: center;
  }
  .progress-bar.radio { cursor: default; opacity: var(--opacity-hidden); pointer-events: none; }

  .rail {
    position: absolute; left: var(--space-0); width: 100%; top: var(--space-2xs);
    height: var(--space-0_5); background: var(--c-border); transition: height var(--dur-fast);
  }
  .fill {
    position: absolute; left: var(--space-0); top: var(--space-2xs); height: var(--space-0_5);
    width: 100%; transform-origin: left center;
    background: var(--c-accent); pointer-events: none;
  }
  .progress-bar:hover .rail, .progress-bar:hover .fill { height: var(--space-1); top: var(--space-5px); }
  .knob {
    position: absolute; top: 50%; left: var(--space-0);
    width: var(--space-3); height: var(--space-3); border-radius: var(--radius-circle);
    background: var(--c-text-primary); transform: translate(-50%, -50%) scale(0);
    box-shadow: var(--shadow-xs-strong);
  }
  .progress-bar:hover .knob { transform: translate(-50%, -50%) scale(1); }

  .tooltip {
    position: absolute; top: calc(-1 * var(--space-28px));
    background: var(--c-surface-active); color: var(--c-text-primary);
    font-size: var(--text-xs); font-weight: var(--weight-bold); padding: var(--space-3px) var(--space-2);
    border-radius: var(--radius-sm); transform: translateX(-50%);
    pointer-events: none; box-shadow: var(--shadow-sm);
  }

  .grid {
    display: grid; grid-template-columns: 1fr max-content 1fr;
    height: 100%; padding: var(--space-0) var(--space-8); align-items: center;
    gap: var(--space-5); position: relative; z-index: 105;
  }

  .info { display: flex; align-items: center; gap: var(--space-4); overflow: hidden; }
  .art {
    width: var(--thumb-lg); height: var(--thumb-lg); border-radius: var(--radius-sm);
    background: var(--c-bg-placeholder); overflow: hidden;
    flex-shrink: 0; position: relative;
  }
  .icon-fallback {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    color: var(--c-icon-faint);
  }
  .icon-fallback :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); opacity: var(--opacity-faint); }

  .meta { display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
  .title-row { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-0_5); }
  .title { font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--c-text-primary); }
  .artist-row { display: flex; align-items: center; gap: var(--space-2); }
  .artist { font-size: var(--text-base); color: var(--c-text-secondary); }

  .tiny-dots {
    width: var(--circle-btn-sm); height: var(--circle-btn-sm); min-width: var(--circle-btn-sm); padding: var(--space-0);
    border-radius: var(--radius-circle); color: var(--c-text-secondary);
    background: transparent; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; opacity: var(--opacity-dim);
  }
  .tiny-dots:hover { color: var(--c-text-primary); background: var(--c-white-10); opacity: var(--opacity-visible); }

  .controls { display: flex; align-items: center; gap: var(--space-5); }

  .play-btn {
    width: var(--circle-play-md); height: var(--circle-play-md); border-radius: var(--radius-circle);
    background: var(--c-text-primary); color: var(--c-text-inverse);
    box-shadow: var(--shadow-md);
    transition: transform var(--dur-instant); border: none;
  }
  .play-btn:hover { transform: scale(1.05); }
  .play-btn:active { transform: scale(0.95); }
  .play-btn :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); }

  .volume { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); }

  @media (max-width: 768px) {
    .desktop { display: none !important; }
    .grid { grid-template-columns: 1fr max-content; padding: var(--space-0) var(--space-4); }
    .play-btn { width: var(--control-h-lg); height: var(--control-h-lg); }
    .art { width: var(--thumb-md); height: var(--thumb-md); }
    .tiny-dots { display: none; }
    .meta-tag { display: none; }
  }
</style>
