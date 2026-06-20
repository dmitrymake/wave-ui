<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { sendArt, receiveArt, fadeVar, hold } from "../lib/transitions";
  import { seek, nav, togglePlay } from "../lib/playerActions";
  import { ICONS } from "../lib/icons";
  import {
    currentSong,
    status,
    isFullPlayerOpen,
    stations,
    getTrackCoverUrl,
  } from "../lib/store.js";
  import { formatTime, isRadioStream, getQualityLabel } from "../lib/playerHelpers";
  import { createSeekController } from "../lib/seekDrag.svelte";
  import ImageLoader from "./ImageLoader.svelte";
  import Marquee from "./Marquee.svelte";
  import VolumeSlider from "./VolumeSlider.svelte";
  import PlayModeButton from "./PlayModeButton.svelte";
  import LikeButton from "./LikeButton.svelte";

  let { isDocked = false }: { isDocked?: boolean } = $props();

  let startY = 0;
  let currentY = $state(0);
  let isDraggingPlayer = $state(false);

  function close() {
    isFullPlayerOpen.set(false);
  }

  function handleTouchStart(e: TouchEvent) {
    if (isDocked) return;
    const target = e.target as HTMLElement;
    if (target.closest(".bar-hit-area") || target.closest(".volume-row"))
      return;
    startY = e.touches[0].clientY;
    isDraggingPlayer = true;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isDraggingPlayer || isDocked) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0) {
      if (e.cancelable && delta > 10) e.preventDefault();
      currentY = delta;
    }
  }

  function handleTouchEnd() {
    if (isDocked) return;
    isDraggingPlayer = false;
    if (currentY > 150) close();
    else currentY = 0;
  }

  let artSrc = $derived(getTrackCoverUrl($currentSong, $stations, $currentSong.stationName));

  let progressBar: HTMLElement;

  let duration = $derived($status.duration || 1);
  let elapsed = $derived($status.elapsed || 0);
  let isRadio = $derived(isRadioStream($currentSong));
  let isPlaying = $derived($status.state === "play");

  const seekCtl = createSeekController({
    getElement: () => progressBar,
    getDuration: () => duration,
    getElapsed: () => elapsed,
    getIsRadio: () => isRadio,
    seekTo: seek,
  });

  let isDraggingBar = $derived(seekCtl.isDragging);
  let isSmooth = $derived(isPlaying && !isDraggingBar && !isRadio);
  let progressPct = $derived(seekCtl.fraction * 100);
  let qualityLabel = $derived(getQualityLabel($status));
  let artworkRadius = $derived(isDocked ? "var(--radius-md)" : "var(--radius-xl)");
</script>

<div
  class="full-player"
  class:is-docked={isDocked}
  transition:hold|global={{ duration: isDocked ? 0 : 440 }}
>
  <div
    class="full-player-sheet"
    class:is-dragging={isDraggingPlayer}
    style={!isDocked
      ? `transform: translateY(${currentY}px); transition: ${isDraggingPlayer ? "none" : "transform var(--dur-base) var(--ease-emphasized)"}`
      : ""}
  >
  {#if !isDocked}
    <div
      class="drag-zone"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      onclick={close}
      role="presentation"
    >
      <div class="drag-handle-icon">
        {@html ICONS.CHEVRON_DOWN}
      </div>
    </div>
  {/if}

  <div class="bg-container" transition:fade|global={{ duration: 320 }}>
    <div class="bg-gradient-fallback"></div>
    <img class="bg-img" src={artSrc} alt="" loading="eager" />
    <div class="bg-overlay"></div>
  </div>

  {#snippet cover()}
    <ImageLoader src={artSrc} alt="Cover" radius={artworkRadius}>
      {#snippet fallback()}
        <div class="icon-fallback">
          {@html isRadio ? ICONS.RADIO : ICONS.ALBUMS}
        </div>
      {/snippet}
    </ImageLoader>
  {/snippet}

  <div class="player-body">
    <div
      class="art-container"
      style={!isDocked ? `transform: scale(${1 - currentY / 3000})` : ""}
    >
      {#if isDocked}
        <div class="artwork">{@render cover()}</div>
      {:else}
        <!-- Hero: flies + scales between this and the mini-player thumbnail. -->
        <div
          class="artwork"
          in:receiveArt|global={{ key: "np-art" }}
          out:sendArt|global={{ key: "np-art" }}
        >
          {@render cover()}
        </div>
      {/if}
    </div>

    <div class="controls-area" style="--drag-op: {1 - currentY / 400}" transition:fadeVar|global={{ duration: 300 }}>
      <div class="meta">
        <h1 class="title">
          <Marquee text={$currentSong.title || "Not Playing"} />
        </h1>
        <div class="artist-row">
          <h2 class="artist">
            <Marquee
              text={$currentSong.stationName || $currentSong.artist || "Moode Audio"}
            />
          </h2>
          {#if qualityLabel}
            <span class="meta-tag quality">{qualityLabel}</span>
          {/if}
        </div>
      </div>

      <div class="progress-section">
        <div
          class="bar-hit-area"
          class:is-docked-bar={isDocked}
          bind:this={progressBar}
          onmousedown={seekCtl.onMouseDown}
          ontouchstart={seekCtl.onTouchStart}
          onmousemove={isDraggingBar ? seekCtl.onMouseMove : null}
          ontouchmove={isDraggingBar ? seekCtl.onTouchMove : null}
          onmouseup={seekCtl.onMouseUp}
          ontouchend={seekCtl.onTouchEnd}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
          tabindex="0"
        >
          <div class="common-track">
            <div
              class="common-fill"
              style="transform: scaleX({progressPct / 100}); transition: {isSmooth ? 'transform var(--dur-base) var(--ease-linear)' : 'none'}"
            ></div>
            <div
              class="common-knob"
              style="left: {progressPct}%; transition: {isSmooth ? 'left var(--dur-base) var(--ease-linear)' : 'none'}"
            ></div>
          </div>
        </div>
        <div class="time-row">
          <span>{formatTime(seekCtl.displaySeconds)}</span>
          <span>{isRadio ? "LIVE" : formatTime(duration)}</span>
        </div>
      </div>

      <div class="buttons-row">
        <LikeButton track={$currentSong} />

        <button class="btn-icon side-btn" onclick={() => nav("previous")}>
          {@html ICONS.PREVIOUS}
        </button>

        <button class="play-btn-large flex-center" onclick={togglePlay}>
          {@html $status.state === "play" ? ICONS.PAUSE : ICONS.PLAY}
        </button>

        <button class="btn-icon side-btn" onclick={() => nav("next")}>
          {@html ICONS.NEXT}
        </button>

        {#if !isRadio}
          <PlayModeButton compact={isDocked} />
        {:else}
          <div style="width: 44px;"></div>
        {/if}
      </div>

      <VolumeSlider />
    </div>
  </div>
  </div>
</div>

<style>
  .full-player {
    position: fixed;
    inset: var(--space-0);
    z-index: var(--z-modal);
    /* Transparent: during open/close the (fading) blurred backdrop lives in
       .bg-container, so the scaled-down app behind shows through for depth, while the
       artwork flies in as an opaque hero (see crossfade in lib/transitions). */
    background: transparent;
    display: flex;
    flex-direction: column;
    touch-action: none;
  }
  .full-player.is-docked {
    position: relative;
    inset: auto;
    z-index: var(--z-base);
    width: 100%;
    height: 100%;
    background: transparent;
    border-left: var(--border-default);
    overflow: hidden;
    will-change: auto;
  }

  /* Inner sheet — owns ONLY the drag transform (decoupled from the open/close
     slide on .full-player so the two never clobber each other's transform). */
  .full-player-sheet {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    backface-visibility: hidden;
  }
  /* hint only while actively dragging (class toggles in markup); the open/close
     slide auto-promotes during its own transform — no standing layer at idle. */
  .full-player-sheet.is-dragging {
    will-change: transform;
  }

  .bg-container {
    position: absolute;
    top: var(--space-0); left: var(--space-0); width: 100%; height: 100%;
    z-index: var(--z-base); overflow: hidden; pointer-events: none;
  }
  .bg-gradient-fallback {
    position: absolute; inset: var(--space-0);
    background: linear-gradient(135deg, var(--c-bg-main) 0%, var(--c-bg-app) 100%);
    z-index: var(--z-base);
  }
  .bg-img {
    position: absolute; top: var(--space-0); left: var(--space-0); width: 100%; height: 100%;
    object-fit: cover; z-index: var(--z-above);
    transform: scale(1.6);
    /* radius/saturate trimmed hard: invisible under the 50-90% black overlay, far cheaper
       gaussian on the Pi GPU (per-track / standing-docked rasterization cost). */
    filter: blur(14px) brightness(1.1) saturate(1.5);
    opacity: var(--opacity-strong); transition: opacity 0.5s ease-in;
  }
  .bg-overlay {
    position: absolute; top: var(--space-0); left: var(--space-0); width: 100%; height: 100%;
    z-index: var(--z-content);
    background: linear-gradient(to bottom, var(--c-black-50) 0%, var(--c-black-90) 100%);
  }
  .is-docked .bg-img { filter: blur(12px) brightness(1.2) saturate(1.6); opacity: var(--opacity-visible); }
  .is-docked .bg-overlay { background: var(--c-black-70); }

  .player-body {
    flex: 1; display: flex; flex-direction: column;
    padding: var(--space-0) var(--space-6) var(--space-10); max-width: 500px; width: 100%;
    margin: var(--space-0) auto; box-sizing: border-box;
    justify-content: center; gap: var(--space-8);
    position: relative; z-index: 4;
  }
  .is-docked .player-body {
    padding: var(--space-3) var(--space-4) var(--space-4); gap: var(--space-3);
    justify-content: flex-end; max-width: 100%;
  }

  .drag-zone {
    height: 40vh; width: 100%; position: absolute; top: var(--space-0); z-index: var(--z-overlay-local);
    display: flex; justify-content: center; align-items: flex-start;
    padding-top: var(--space-4); cursor: pointer;
  }
  .drag-handle-icon { color: var(--c-white-30); transition: color var(--dur-fast); width: 32px; height: 32px; }
  .drag-zone:active .drag-handle-icon { color: var(--c-white-60); }
  .drag-handle-icon :global(svg) { width: 100%; height: 100%; stroke-width: 3; }

  .art-container {
    display: flex; justify-content: center; align-items: center;
    width: 100%; flex-grow: 0; flex-shrink: 1; min-height: 0;
  }
  .is-docked .art-container {
    flex: 1 1 auto; margin-bottom: var(--space-0); height: 100%; max-height: 50vh; overflow: hidden;
  }
  .artwork {
    width: 100%; max-width: 400px; aspect-ratio: 1;
    background: var(--c-bg-placeholder); border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg); overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .is-docked .artwork {
    height: 100%; width: auto; max-width: 100%;
    border-radius: var(--radius-md); box-shadow: none; aspect-ratio: 1/1;
  }
  .artwork :global(img) { width: 100%; height: 100%; object-fit: cover; }

  .icon-fallback {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    color: var(--c-icon-faint);
  }
  .icon-fallback :global(svg) { width: 100px; height: 100px; opacity: var(--opacity-faint); }

  .controls-area {
    display: flex; flex-direction: column; gap: var(--space-5); flex-shrink: 0; width: 100%;
    /* drag feedback (--drag-op) * open/close fade (--t-op), composed so neither clobbers the other */
    opacity: calc(var(--drag-op, 1) * var(--t-op, 1));
  }
  .is-docked .controls-area { gap: var(--space-2); flex: 0 0 auto; }

  .meta { text-align: left; margin-bottom: var(--space-2); }
  .is-docked .meta { text-align: center; margin-bottom: var(--space-1); }

  .title { font-size: var(--text-3xl); font-weight: var(--weight-bold); margin: var(--space-0) var(--space-0) var(--space-1); color: var(--c-text-primary); }
  .is-docked .title { font-size: var(--text-lg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .artist-row { display: flex; align-items: center; gap: var(--space-2); width: 100%; }
  .is-docked .artist-row { justify-content: center; }
  .artist { font-size: var(--text-lg); color: var(--c-text-secondary); margin: var(--space-0); flex: 1 1 auto; min-width: 0; }
  .is-docked .artist { font-size: var(--text-base); }

  .bar-hit-area {
    height: var(--space-10); display: flex; align-items: center; cursor: pointer;
    touch-action: none; position: relative; width: 100%;
  }
  .is-docked-bar { height: var(--space-6); }

  .common-track {
    width: 100%; height: var(--space-1); background: var(--c-white-20); border-radius: var(--radius-xs); position: relative;
  }
  .common-fill {
    position: absolute; left: var(--space-0); top: var(--space-0);
    width: 100%; height: 100%; transform-origin: left center;
    background: var(--c-text-primary); border-radius: var(--radius-xs); pointer-events: none;
  }
  .common-knob {
    position: absolute; top: 50%; left: var(--space-0);
    transform: translate(-50%, -50%);
    width: 14px; height: 14px; background: var(--c-text-primary); border-radius: var(--radius-circle);
    box-shadow: var(--shadow-sm-strong); pointer-events: none;
  }

  .time-row {
    display: flex; justify-content: space-between; margin-top: calc(-1 * var(--space-3));
    font-size: var(--text-sm); color: var(--c-white-90); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums;
  }
  .is-docked .time-row { margin-top: var(--space-0); font-size: var(--text-2xs); }

  .buttons-row {
    display: flex; justify-content: space-between; align-items: center; padding: var(--space-0) var(--space-2);
  }
  .is-docked .buttons-row { gap: var(--space-0); }

  .side-btn { padding: var(--icon-btn-pad-lg); color: var(--c-text-secondary); transition: color var(--dur-fast); }
  .side-btn:active { opacity: var(--opacity-dim); }
  .side-btn :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); }
  .is-docked .side-btn { padding: var(--icon-btn-pad-sm); }
  .is-docked .side-btn :global(svg) { width: var(--icon-size-md); height: var(--icon-size-md); }

  .play-btn-large {
    width: var(--circle-play-lg); height: var(--circle-play-lg); border-radius: var(--radius-circle);
    background: var(--c-text-primary); color: var(--c-text-inverse);
    box-shadow: var(--shadow-sm); transition: transform var(--dur-instant);
    border: none; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .play-btn-large:active { transform: scale(0.95); }
  .play-btn-large :global(svg) { width: var(--icon-size-xl); height: var(--icon-size-xl); fill: currentColor; }
  .is-docked .play-btn-large { width: var(--circle-play-sm); height: var(--circle-play-sm); }
  .is-docked .play-btn-large :global(svg) { width: var(--icon-size-md); height: var(--icon-size-md); }

  .is-docked :global(.volume-row) { gap: var(--space-2); }
</style>
