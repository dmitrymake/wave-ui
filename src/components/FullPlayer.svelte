<script lang="ts">
  import { fly } from "svelte/transition";
  import * as MPD from "../lib/mpd";
  import { ICONS } from "../lib/icons";
  import {
    currentSong,
    status,
    isFullPlayerOpen,
    stations,
    getTrackCoverUrl,
  } from "../lib/store.js";
  import { formatTime, getPct, isRadioStream, getQualityLabel } from "../lib/playerHelpers";
  import ImageLoader from "./ImageLoader.svelte";
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

  let isDraggingBar = $state(false);
  let dragProgress = $state(0);
  let progressBar: HTMLElement;

  let duration = $derived($status.duration || 1);
  let elapsed = $derived($status.elapsed || 0);
  let isRadio = $derived(isRadioStream($currentSong));
  let isPlaying = $derived($status.state === "play");
  let isSmooth = $derived(isPlaying && !isDraggingBar && !isRadio);
  let progressPct = $derived(isRadio ? 0 : isDraggingBar ? dragProgress * 100 : (elapsed / duration) * 100);
  let qualityLabel = $derived(getQualityLabel($status));
  let artworkRadius = $derived(isDocked ? "8px" : "var(--radius-xl)");

  function handleSeekStart(e: MouseEvent | TouchEvent) {
    if (isRadio) return;
    isDraggingBar = true;
    dragProgress = getPct(e, progressBar);
  }

  function handleSeekMove(e: MouseEvent | TouchEvent) {
    if (isDraggingBar) dragProgress = getPct(e, progressBar);
  }

  function handleSeekEnd() {
    if (isDraggingBar && !isRadio) {
      MPD.seek(dragProgress * duration);
    }
    isDraggingBar = false;
  }
</script>

<div
  class="full-player"
  class:is-docked={isDocked}
  transition:fly={{ y: isDocked ? 0 : 800, duration: 300, opacity: 1 }}
  style={!isDocked
    ? `transform: translateY(${currentY}px); transition: ${isDraggingPlayer ? "none" : "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)"}`
    : ""}
>
  {#if !isDocked}
    <div
      class="drag-zone"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      onclick={close}
    >
      <div class="drag-handle-icon">
        {@html ICONS.CHEVRON_DOWN}
      </div>
    </div>
  {/if}

  <div class="bg-container">
    <div class="bg-gradient-fallback"></div>
    <img class="bg-img" src={artSrc} alt="" loading="eager" />
    <div class="bg-overlay"></div>
  </div>

  <div class="player-body">
    <div class="art-container">
      <div class="artwork" style="transform: scale({1 - currentY / 3000})">
        <ImageLoader src={artSrc} alt="Cover" radius={artworkRadius}>
          {#snippet fallback()}
            <div class="icon-fallback">
              {@html isRadio ? ICONS.RADIO : ICONS.ALBUMS}
            </div>
          {/snippet}
        </ImageLoader>
      </div>
    </div>

    <div class="controls-area" style="opacity: {1 - currentY / 400}">
      <div class="meta">
        <h1 class="title text-ellipsis">
          {$currentSong.title || "Not Playing"}
        </h1>
        <div class="artist-row">
          <h2 class="artist text-ellipsis">
            {$currentSong.stationName || $currentSong.artist || "Moode Audio"}
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
          onmousedown={handleSeekStart}
          ontouchstart={handleSeekStart}
          onmousemove={isDraggingBar ? handleSeekMove : null}
          ontouchmove={isDraggingBar ? handleSeekMove : null}
          onmouseup={handleSeekEnd}
          ontouchend={handleSeekEnd}
        >
          <div class="common-track">
            <div
              class="common-fill"
              style="width: {progressPct}%; transition: {isSmooth ? 'width 0.3s linear' : 'none'}"
            >
              <div class="common-knob"></div>
            </div>
          </div>
        </div>
        <div class="time-row">
          <span>{isDraggingBar ? formatTime(dragProgress * duration) : formatTime(elapsed)}</span>
          <span>{isRadio ? "LIVE" : formatTime(duration)}</span>
        </div>
      </div>

      <div class="buttons-row">
        <LikeButton track={$currentSong} />

        <button class="btn-icon side-btn" onclick={() => MPD.nav("previous")}>
          {@html ICONS.PREVIOUS}
        </button>

        <button class="play-btn-large flex-center" onclick={MPD.togglePlay}>
          {@html $status.state === "play" ? ICONS.PAUSE : ICONS.PLAY}
        </button>

        <button class="btn-icon side-btn" onclick={() => MPD.nav("next")}>
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

<style>
  .full-player {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: var(--c-bg-app);
    display: flex;
    flex-direction: column;
    touch-action: none;
  }
  .full-player.is-docked {
    position: relative;
    inset: auto;
    z-index: 1;
    width: 100%;
    height: 100%;
    background: transparent;
    border-left: 1px solid var(--c-border);
    overflow: hidden;
  }

  .bg-container {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 1; overflow: hidden; pointer-events: none;
  }
  .bg-gradient-fallback {
    position: absolute; inset: 0;
    background: linear-gradient(135deg, #121212 0%, #000000 100%);
    z-index: 1;
  }
  .bg-img {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    object-fit: cover; z-index: 2;
    transform: scale(1.6);
    filter: blur(50px) brightness(1.1) saturate(3) contrast(1.2);
    opacity: 0.8; transition: opacity 0.5s ease-in;
  }
  .bg-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 3;
    background: linear-gradient(to bottom, var(--c-black-50) 0%, rgba(0, 0, 0, 0.95) 100%);
  }
  .is-docked .bg-img { filter: blur(35px) brightness(1.2) saturate(3.5); opacity: 1; }
  .is-docked .bg-overlay { background: var(--c-black-70); }

  .player-body {
    flex: 1; display: flex; flex-direction: column;
    padding: 0 24px 40px; max-width: 500px; width: 100%;
    margin: 0 auto; box-sizing: border-box;
    justify-content: center; gap: 30px;
    position: relative; z-index: 4;
  }
  .is-docked .player-body {
    padding: 10px 16px 16px; gap: 12px;
    justify-content: flex-end; max-width: 100%;
  }

  .drag-zone {
    height: 40vh; width: 100%; position: absolute; top: 0; z-index: 10;
    display: flex; justify-content: center; align-items: flex-start;
    padding-top: 15px; cursor: pointer;
  }
  .drag-handle-icon { color: var(--c-white-30); transition: color 0.2s; width: 32px; height: 32px; }
  .drag-zone:active .drag-handle-icon { color: var(--c-white-60); }
  .drag-handle-icon :global(svg) { width: 100%; height: 100%; stroke-width: 3; }

  .art-container {
    display: flex; justify-content: center; align-items: center;
    width: 100%; flex-grow: 0; margin-bottom: 10px; flex-shrink: 1; min-height: 0;
  }
  .is-docked .art-container {
    flex: 1 1 auto; margin-bottom: 0; height: 100%; max-height: 50vh; overflow: hidden;
  }
  .artwork {
    width: 100%; max-width: 400px; aspect-ratio: 1;
    background: var(--c-bg-placeholder); border-radius: var(--radius-xl);
    box-shadow: var(--c-shadow-popover); overflow: hidden; will-change: transform;
    display: flex; align-items: center; justify-content: center;
  }
  .is-docked .artwork {
    height: 100%; width: auto; max-width: 100%;
    border-radius: 8px; box-shadow: none; aspect-ratio: 1/1;
  }
  .artwork :global(img) { width: 100%; height: 100%; object-fit: cover; }

  .icon-fallback {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    color: var(--c-icon-faint);
  }
  .icon-fallback :global(svg) { width: 100px; height: 100px; opacity: 0.5; }

  .controls-area { display: flex; flex-direction: column; gap: 20px; flex-shrink: 0; width: 100%; }
  .is-docked .controls-area { gap: 8px; flex: 0 0 auto; }

  .meta { text-align: left; margin-bottom: 10px; }
  .is-docked .meta { text-align: center; margin-bottom: 4px; }

  .title { font-size: 24px; font-weight: 700; margin: 0 0 4px; color: var(--c-text-primary); }
  .is-docked .title { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .artist-row { display: flex; align-items: center; gap: 10px; width: 100%; }
  .is-docked .artist-row { justify-content: center; }
  .artist { font-size: 18px; color: var(--c-text-secondary); margin: 0; flex-shrink: 1; }
  .is-docked .artist { font-size: 13px; }

  .bar-hit-area {
    height: 40px; display: flex; align-items: center; cursor: pointer;
    touch-action: none; position: relative; width: 100%;
  }
  .is-docked-bar { height: 24px; }

  .common-track {
    width: 100%; height: 4px; background: var(--c-white-20); border-radius: 2px; position: relative;
  }
  .common-fill {
    height: 100%; background: var(--c-text-primary); border-radius: 2px;
    position: relative; left: 0; top: 0; pointer-events: none;
  }
  .common-knob {
    position: absolute; top: 50%; margin-top: -7px; right: -7px;
    width: 14px; height: 14px; background: #fff; border-radius: 50%;
    box-shadow: 0 2px 4px var(--c-black-50); pointer-events: none;
  }

  .time-row {
    display: flex; justify-content: space-between; margin-top: -12px;
    font-size: 12px; color: var(--c-white-90); font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .is-docked .time-row { margin-top: 0px; font-size: 10px; }

  .buttons-row {
    display: flex; justify-content: space-between; align-items: center; padding: 0 8px;
  }
  .is-docked .buttons-row { gap: 0; }

  .side-btn { padding: 10px; color: var(--c-text-secondary); transition: color 0.2s; }
  .side-btn:active { opacity: 0.7; }
  .side-btn :global(svg) { width: 24px; height: 24px; }
  .is-docked .side-btn { padding: 6px; }
  .is-docked .side-btn :global(svg) { width: 20px; height: 20px; }

  .play-btn-large {
    width: 64px; height: 64px; border-radius: 50%;
    background: var(--c-text-primary); color: var(--c-text-inverse);
    box-shadow: var(--c-shadow-card); transition: transform 0.1s;
    border: none; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .play-btn-large:active { transform: scale(0.95); }
  .play-btn-large :global(svg) { width: 28px; height: 28px; fill: currentColor; }
  .is-docked .play-btn-large { width: 44px; height: 44px; }
  .is-docked .play-btn-large :global(svg) { width: 20px; height: 20px; }

  .is-docked .volume-row { gap: 8px; }
</style>
