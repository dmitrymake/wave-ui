<script>
  import { fly } from "svelte/transition";
  import * as MPD from "../lib/mpd";
  import { ICONS } from "../lib/icons";
  import { LibraryActions } from "../lib/mpd/library";
  import {
    currentSong,
    status,
    isFullPlayerOpen,
    favorites,
    getTrackCoverUrl,
    stations,
  } from "../lib/store.js";
  import ImageLoader from "./ImageLoader.svelte";

  // --- SWIPE LOGIC ---
  let startY = 0;
  let currentY = 0;
  let isDraggingPlayer = false;

  function close() {
    isFullPlayerOpen.set(false);
  }

  function handleTouchStart(e) {
    const target = e.target;
    if (target.closest(".bar-hit-area") || target.closest(".volume-hit-area"))
      return;

    startY = e.touches[0].clientY;
    isDraggingPlayer = true;
  }

  function handleTouchMove(e) {
    if (!isDraggingPlayer) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0) {
      if (e.cancelable && delta > 10) e.preventDefault();
      currentY = delta;
    }
  }

  function handleTouchEnd() {
    isDraggingPlayer = false;
    if (currentY > 150) close();
    else currentY = 0;
  }

  // --- IMAGE HANDLING ---
  $: artSrc = getTrackCoverUrl(
    $currentSong,
    $stations,
    $currentSong.stationName,
  );

  // --- PROGRESS BAR ---
  let isDraggingBar = false;
  let dragProgress = 0;
  let progressBar;

  $: duration = $status.duration || 1;
  $: elapsed = $status.elapsed || 0;
  $: isRadio = $currentSong.file?.startsWith("http");
  $: isPlaying = $status.state === "play";
  $: isSmooth = isPlaying && !isDraggingBar && !isRadio;

  $: progressPct = isRadio
    ? 0
    : isDraggingBar
      ? dragProgress * 100
      : (elapsed / duration) * 100;

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60) || 0;
    const s = Math.floor(seconds % 60) || 0;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function getPct(e, element) {
    const rect = element.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function handleSeekStart(e) {
    if (isRadio) return;
    isDraggingBar = true;
    dragProgress = getPct(e, progressBar);
  }

  function handleSeekMove(e) {
    if (isDraggingBar) dragProgress = getPct(e, progressBar);
  }

  function handleSeekEnd() {
    if (isDraggingBar && !isRadio) {
      MPD.seek(dragProgress * duration);
    }
    isDraggingBar = false;
  }

  // --- VOLUME SLIDER ---
  let isDraggingVol = false;
  let volumeBar;

  function handleVolStart(e) {
    isDraggingVol = true;
    const vol = Math.round(getPct(e, volumeBar) * 100);
    MPD.setVolume(vol);
    window.addEventListener("mousemove", onVolMove);
    window.addEventListener("mouseup", onVolEnd);
    window.addEventListener("touchmove", onVolMove, { passive: false });
    window.addEventListener("touchend", onVolEnd);
  }

  function onVolMove(e) {
    if (isDraggingVol) {
      e.preventDefault();
      const vol = Math.round(getPct(e, volumeBar) * 100);
      MPD.setVolume(vol);
    }
  }

  function onVolEnd() {
    isDraggingVol = false;
    window.removeEventListener("mousemove", onVolMove);
    window.removeEventListener("mouseup", onVolEnd);
    window.removeEventListener("touchmove", onVolMove);
    window.removeEventListener("touchend", onVolEnd);
  }

  // --- PLAY MODES ---
  $: currentMode = $status.repeat ? 2 : $status.random ? 1 : 0;

  function togglePlayMode() {
    const nextMode = (currentMode + 1) % 3;
    if (nextMode === 0) {
      if ($status.random) MPD.toggleRandom();
      if ($status.repeat) MPD.toggleRepeat();
    } else if (nextMode === 1) {
      if (!$status.random) MPD.toggleRandom();
      if ($status.repeat) MPD.toggleRepeat();
    } else if (nextMode === 2) {
      if ($status.random) MPD.toggleRandom();
      if (!$status.repeat) MPD.toggleRepeat();
    }
  }

  $: qualityLabel = $status.bitrate
    ? `${$status.bitrate} kbps`
    : $status.format || "";
  $: isLiked = $currentSong.file && $favorites.has($currentSong.file);
</script>

<div
  class="full-player"
  transition:fly={{ y: 800, duration: 300, opacity: 1 }}
  style="transform: translateY({currentY}px); transition: {isDraggingPlayer
    ? 'none'
    : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'}"
>
  <div
    class="drag-zone"
    on:touchstart={handleTouchStart}
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}
    on:click={close}
  >
    <div class="drag-handle-icon">
      {@html ICONS.CHEVRON_DOWN}
    </div>
  </div>

  <div class="bg-blur" style="background-image: url({artSrc})"></div>
  <div class="bg-overlay"></div>

  <div class="player-body">
    <div class="art-container">
      <div class="artwork" style="transform: scale({1 - currentY / 3000})">
        <ImageLoader src={artSrc} alt="Cover" radius="var(--radius-xl)">
          <div slot="fallback" class="icon-fallback">
            {@html isRadio ? ICONS.RADIO : ICONS.ALBUMS}
          </div>
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
            <span class="badge">{qualityLabel}</span>
          {/if}
        </div>
      </div>

      <div class="progress-section">
        <div
          class="bar-hit-area"
          bind:this={progressBar}
          on:mousedown={handleSeekStart}
          on:touchstart|passive={handleSeekStart}
          on:mousemove={isDraggingBar ? handleSeekMove : null}
          on:touchmove|passive={isDraggingBar ? handleSeekMove : null}
          on:mouseup={handleSeekEnd}
          on:touchend={handleSeekEnd}
        >
          <div class="common-track">
            <div
              class="common-fill"
              style="width: {progressPct}%; transition: {isSmooth
                ? 'width 0.3s linear'
                : 'none'}"
            >
              <div class="common-knob"></div>
            </div>
          </div>
        </div>
        <div class="time-row">
          <span
            >{isDraggingBar
              ? formatTime(dragProgress * duration)
              : formatTime(elapsed)}</span
          >
          <span>{isRadio ? "LIVE" : formatTime(duration)}</span>
        </div>
      </div>

      <div class="buttons-row">
        <button
          class="btn-icon side-btn"
          class:liked={isLiked}
          on:click={() => LibraryActions.toggleFavorite($currentSong)}
        >
          {@html isLiked ? ICONS.HEART_FILLED : ICONS.HEART}
        </button>

        <button class="btn-icon side-btn" on:click={() => MPD.nav("previous")}>
          {@html ICONS.PREVIOUS}
        </button>

        <button class="play-btn-large flex-center" on:click={MPD.togglePlay}>
          {@html $status.state === "play" ? ICONS.PAUSE : ICONS.PLAY}
        </button>

        <button class="btn-icon side-btn" on:click={() => MPD.nav("next")}>
          {@html ICONS.NEXT}
        </button>

        {#if !isRadio}
          <button
            class="btn-icon side-btn mode-btn"
            class:active={currentMode > 0}
            on:click={togglePlayMode}
          >
            {#if currentMode === 2}
              {@html ICONS.REPEAT}
            {:else}
              {@html ICONS.SHUFFLE}
            {/if}
            {#if currentMode > 0}<span class="dot"></span>{/if}
          </button>
        {:else}
          <div style="width: 44px;"></div>
        {/if}
      </div>

      <div class="volume-row">
        <div class="vol-icon">{@html ICONS.VOLUME}</div>
        <div
          class="volume-hit-area"
          bind:this={volumeBar}
          on:mousedown|stopPropagation={handleVolStart}
          on:touchstart|stopPropagation={handleVolStart}
        >
          <div class="common-track">
            <div class="common-fill" style="width: {$status.volume}%"></div>
            <div
              class="common-knob"
              style="left: {$status.volume}%; right: auto;"
            ></div>
          </div>
        </div>
      </div>
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

  .drag-zone {
    height: 30vh;
    width: 100%;
    position: absolute;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 15px;
    cursor: pointer;
  }
  .drag-handle-icon {
    color: rgba(255, 255, 255, 0.3);
    transition: color 0.2s;
    width: 32px;
    height: 32px;
  }
  .drag-zone:active .drag-handle-icon {
    color: rgba(255, 255, 255, 0.6);
  }
  .drag-handle-icon :global(svg) {
    width: 100%;
    height: 100%;
    stroke-width: 3;
  }

  .bg-blur {
    position: absolute;
    inset: -40px;
    z-index: -2;
    background-size: cover;
    background-position: center;
    filter: blur(60px) brightness(0.5);
  }
  .bg-overlay {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--c-overlay-dim);
  }

  /* --- LAYOUT CENTERED --- */
  .player-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 24px 40px;
    max-width: 500px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
    /* Центрируем контент по вертикали */
    justify-content: center;
    gap: 30px; /* Отступ между обложкой и контролами */
  }

  /* --- ARTWORK --- */
  .art-container {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    /* Больше не занимаем всё свободное место, а просто центрируем блок */
    flex-grow: 0;
    margin-bottom: 10px; /* Небольшой отступ от низа картинки до текста */
  }
  .artwork {
    width: 100%;
    /* Максимально используем ширину */
    max-width: 400px;
    aspect-ratio: 1;
    background: var(--c-bg-placeholder);
    border-radius: var(--radius-xl);
    box-shadow: 0 20px 60px var(--c-shadow-popover);
    overflow: hidden;
    will-change: transform;
    object-fit: contain;
  }
  .icon-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-icon-faint);
  }
  .icon-fallback :global(svg) {
    width: 100px;
    height: 100px;
    opacity: 0.5;
  }

  /* --- CONTROLS AREA --- */
  .controls-area {
    display: flex;
    flex-direction: column;
    gap: 20px; /* Чуть свободнее */
    flex-shrink: 0;
    width: 100%;
  }

  .meta {
    text-align: left;
    margin-bottom: 10px;
  }
  .title {
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 4px;
    color: var(--c-text-primary);
  }
  .artist-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  .artist {
    font-size: 18px;
    color: var(--c-text-secondary);
    margin: 0;
    flex-shrink: 1;
  }
  .badge {
    font-size: 10px;
    font-weight: 800;
    color: var(--c-text-primary);
    background: var(--c-surface-active);
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  /* --- UNIFIED SLIDERS --- */
  .bar-hit-area,
  .volume-hit-area {
    height: 40px;
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: none;
    position: relative;
    width: 100%; /* Гарантируем полную ширину */
  }

  .volume-hit-area {
    flex: 1;
  }

  .common-track {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    position: relative;
  }

  .common-fill {
    height: 100%;
    background: var(--c-text-primary);
    border-radius: 2px;
    position: relative;
    left: 0;
    top: 0;
    pointer-events: none;
  }

  .volume-hit-area .common-fill {
    position: absolute;
  }

  .common-knob {
    position: absolute;
    top: 50%;
    margin-top: -7px;
    right: -7px;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }

  .volume-hit-area .common-knob {
    transform: translateX(-50%);
    right: auto;
    margin-top: -7px;
  }

  .time-row {
    display: flex;
    justify-content: space-between;
    margin-top: -12px;
    font-size: 12px;
    color: var(--c-text-muted);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* --- BUTTONS --- */
  .buttons-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 8px;
  }

  .side-btn {
    padding: 10px;
    color: var(--c-text-secondary);
    transition: color 0.2s;
  }
  .side-btn:active {
    opacity: 0.7;
  }
  .side-btn.active,
  .side-btn.liked {
    color: var(--c-accent);
  }
  .side-btn :global(svg) {
    width: 24px;
    height: 24px;
  }

  .play-btn-large {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--c-text-primary);
    color: var(--c-text-inverse);
    box-shadow: 0 8px 24px var(--c-shadow-card);
    transition: transform 0.1s;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .play-btn-large:active {
    transform: scale(0.95);
  }
  .play-btn-large :global(svg) {
    width: 28px;
    height: 28px;
    fill: currentColor;
  }

  .mode-btn {
    position: relative;
  }
  .dot {
    position: absolute;
    bottom: 6px;
    width: 4px;
    height: 4px;
    background: var(--c-accent);
    border-radius: 50%;
    left: 50%;
    transform: translateX(-50%);
  }

  /* --- VOLUME ROW --- */
  .volume-row {
    display: flex;
    align-items: center;
    gap: 16px;
    opacity: 0.9;
    padding: 0 4px; /* Чтобы выровнять с прогресс баром визуально */
  }
  .vol-icon :global(svg) {
    width: 20px;
    height: 20px;
    fill: var(--c-text-secondary);
  }
</style>
