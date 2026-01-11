<script>
  import * as MPD from "../lib/mpd";
  import { ICONS } from "../lib/icons";
  import { LibraryActions } from "../lib/mpd/library";
  import { YandexApi } from "../lib/yandex";
  import {
    currentSong,
    status,
    isFullPlayerOpen,
    favorites,
    yandexFavorites,
    showToast,
    getTrackCoverUrl,
    stations,
    openContextMenu,
  } from "../lib/store.js";
  import { longpress } from "../lib/actions";
  import ImageLoader from "./ImageLoader.svelte";

  let isHoveringBar = false;
  let isDragging = false;
  let isDraggingVol = false;
  let dragProgress = 0;
  let progressBar;
  let volumeBar;

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn(e); // передаем событие, т.к. handleToggleLike требует его
  };

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  $: duration = $status.duration > 0 ? $status.duration : 1;
  $: elapsed = $status.elapsed || 0;
  $: isPlaying = $status.state === "play";

  $: isRadio = $currentSong.file?.startsWith("http") && !$currentSong.isYandex;

  $: displayTitle = $currentSong.title || "Not Playing";
  $: displayArtist = $currentSong.stationName || $currentSong.artist || "Moode";

  $: isLiked =
    $currentSong.isYandex || $currentSong.service === "yandex"
      ? $yandexFavorites.has(String($currentSong.id))
      : $currentSong.file && $favorites.has($currentSong.file);

  $: artSrc = getTrackCoverUrl(
    $currentSong,
    $stations,
    $currentSong.stationName,
  );

  $: pct = isRadio
    ? 0
    : isDragging
      ? dragProgress * 100
      : (elapsed / duration) * 100;
  $: smooth = isPlaying && !isDragging && !isRadio;

  $: qualityLabel = $status.bitrate
    ? `${$status.bitrate} kbps`
    : $status.format || "";

  function getPct(e, element) {
    const rect = element.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function handleMouseDown(e) {
    if (isRadio) return;
    isDragging = true;
    dragProgress = getPct(e, progressBar);
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);
  }

  function onWinMove(e) {
    if (isDragging) dragProgress = getPct(e, progressBar);
    if (isDraggingVol) {
      const vol = Math.round(getPct(e, volumeBar) * 100);
      MPD.setVolume(vol);
    }
  }

  function onWinUp() {
    if (isDragging && !isRadio) {
      MPD.seek(dragProgress * duration);
    }
    isDragging = false;
    isDraggingVol = false;
    window.removeEventListener("mousemove", onWinMove);
    window.removeEventListener("mouseup", onWinUp);
  }

  let lastVolume = 50;

  function toggleMute(e) {
    e.stopPropagation();
    if ($status.volume > 0) {
      lastVolume = $status.volume;
      MPD.setVolume(0);
    } else {
      MPD.setVolume(lastVolume > 0 ? lastVolume : 30);
    }
  }

  $: volumeIcon =
    $status.volume === 0
      ? ICONS.VOLUME_MUTE
      : $status.volume < 50
        ? ICONS.VOLUME_MEDIUM
        : ICONS.VOLUME_FULL;

  function handleVolDown(e) {
    isDraggingVol = true;
    const vol = Math.round(getPct(e, volumeBar) * 100);
    MPD.setVolume(vol);
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);
  }

  // 0: Sequence, 1: Shuffle (Random), 2: Repeat (All)
  $: currentMode = $status.repeat ? 2 : $status.random ? 1 : 0;

  function toggleMode() {
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

  function handleContext(e) {
    e.stopPropagation();
    openContextMenu(e, $currentSong, {
      type: "general",
      source: "miniplayer",
    });
  }

  function handleLongPress(e) {
    openContextMenu(e.detail.originalEvent, $currentSong, {
      type: "general",
      source: "miniplayer",
    });
  }

  async function handleToggleLike(e) {
    // e уже остановлен stop(), но на всякий случай
    if (e && e.stopPropagation) e.stopPropagation();

    const track = $currentSong;
    if (!track.file && !track.id) return;

    if (track.isYandex || track.service === "yandex") {
      const liked = $yandexFavorites.has(String(track.id));
      try {
        if (liked) {
          yandexFavorites.update((s) => {
            s.delete(String(track.id));
            return s;
          });
          showToast("Removed from Yandex Likes", "info");
        } else {
          yandexFavorites.update((s) => {
            s.add(String(track.id));
            return s;
          });
          showToast("Added to Yandex Likes", "success");
        }
        await YandexApi.toggleLike(track.id, liked);
      } catch (err) {
        showToast("Error updating like", "error");
      }
    } else {
      LibraryActions.toggleFavorite(track);
    }
  }
</script>

{#if !$isFullPlayerOpen}
  <div
    class="dock"
    on:click={() => isFullPlayerOpen.set(true)}
    use:longpress={500}
    on:longpress={handleLongPress}
  >
    <div
      class="progress-shadow"
      style="width: {pct}%; transition: {smooth
        ? 'width 0.25s linear'
        : 'none'}"
    ></div>

    <div
      class="progress-bar"
      class:radio={isRadio}
      bind:this={progressBar}
      on:mouseenter={() => (isHoveringBar = true)}
      on:mouseleave={() => (isHoveringBar = false)}
      on:mousedown|stopPropagation={handleMouseDown}
      on:click|stopPropagation
    >
      <div class="rail"></div>
      <div
        class="fill"
        style="width: {pct}%; transition: {smooth
          ? 'width 0.25s linear'
          : 'none'}"
      >
        {#if !isRadio}<div class="knob"></div>{/if}
      </div>

      {#if (isHoveringBar || isDragging) && !isRadio}
        <div class="tooltip current" style="left: {pct}%">
          {isDragging
            ? formatTime(dragProgress * duration)
            : formatTime(elapsed)}
        </div>
        <span></span>
      {/if}
    </div>

    <div class="grid">
      <div class="info">
        <div class="art">
          <ImageLoader src={artSrc} alt="art" radius="4px">
            <div slot="fallback" class="icon-fallback">
              {@html isRadio ? ICONS.RADIO : ICONS.ALBUMS}
            </div>
          </ImageLoader>
        </div>

        <div class="meta">
          <div class="title-row">
            <div class="title text-ellipsis" title={displayTitle}>
              {displayTitle}
            </div>
            <button class="btn-icon tiny-dots" on:click={handleContext}>
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
        <button
          class="btn-icon desktop"
          class:liked={isLiked}
          on:click={stop(handleToggleLike)}
        >
          {@html isLiked ? ICONS.HEART_FILLED : ICONS.HEART}
        </button>

        <button class="btn-icon" on:click={stop(() => MPD.nav("previous"))}>
          {@html ICONS.PREVIOUS}
        </button>

        <button class="play-btn flex-center" on:click={stop(MPD.togglePlay)}>
          {@html $status.state === "play" ? ICONS.PAUSE : ICONS.PLAY}
        </button>

        <button class="btn-icon" on:click={stop(() => MPD.nav("next"))}>
          {@html ICONS.NEXT}
        </button>

        {#if !isRadio}
          <button
            class="btn-icon desktop mode-btn"
            class:active={currentMode > 0}
            on:click={stop(toggleMode)}
          >
            {#if currentMode === 2}
              {@html ICONS.REPEAT}
            {:else}
              {@html ICONS.SHUFFLE}
            {/if}
            {#if currentMode > 0}
              <div class="dot"></div>
            {/if}
          </button>
        {/if}
      </div>

      <div class="volume desktop">
        <button class="vol-btn-mini" on:click={toggleMute} title="Mute/Unmute">
          {@html volumeIcon}
        </button>

        <div
          class="custom-slider"
          bind:this={volumeBar}
          on:mousedown|stopPropagation={handleVolDown}
          on:click|stopPropagation
        >
          <div class="slider-bg">
            <div class="slider-fill" style="width: {$status.volume}%"></div>
            <div class="slider-knob" style="left: {$status.volume}%"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dock {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--mini-player-height, 90px);
    background: var(--c-bg-glass);
    border-top: 1px solid var(--c-border-dim);
    z-index: var(--z-dock);
    backdrop-filter: blur(10px);
    cursor: pointer;
    user-select: none;
  }

  .progress-shadow {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    background: var(--c-surface-button);
    z-index: 101;
    pointer-events: none;
    opacity: 0.1;
  }

  .progress-bar {
    position: absolute;
    top: -6px;
    left: 0;
    width: 100%;
    height: 14px;
    z-index: 110;
    cursor: pointer;
    display: flex;
    align-items: center;
  }
  .progress-bar.radio {
    cursor: default;
    opacity: 0;
    pointer-events: none;
  }

  .rail {
    position: absolute;
    left: 0;
    width: 100%;
    top: 6px;
    height: 2px;
    background: var(--c-border);
    transition: height 0.2s;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 6px;
    height: 2px;
    background: var(--c-accent);
    pointer-events: none;
  }

  .progress-bar:hover .rail,
  .progress-bar:hover .fill {
    height: 4px;
    top: 5px;
  }
  .knob {
    position: absolute;
    right: -6px;
    top: -4px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--c-text-primary);
    transform: scale(0);
    transition: transform 0.2s;
    box-shadow: 0 1px 3px var(--c-black-50);
  }
  .progress-bar:hover .knob {
    transform: scale(1);
  }

  .tooltip {
    position: absolute;
    top: -28px;
    background: var(--c-surface-active);
    color: var(--c-text-primary);
    font-size: 11px;
    font-weight: bold;
    padding: 3px 6px;
    border-radius: 4px;
    transform: translateX(-50%);
    pointer-events: none;
    box-shadow: 0 2px 5px var(--c-shadow-card);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr max-content 1fr;
    height: 100%;
    padding: 0 32px;
    align-items: center;
    gap: 20px;
    position: relative;
    z-index: 105;
  }

  .info {
    display: flex;
    align-items: center;
    gap: 16px;
    overflow: hidden;
  }
  .art {
    width: 64px;
    height: 64px;
    border-radius: 4px;
    background: var(--c-bg-placeholder);
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
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
    width: 24px;
    height: 24px;
    opacity: 0.5;
  }

  .meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }

  .title {
    font-size: 15px;
    font-weight: 500;
    color: var(--c-text-primary);
  }

  .artist-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .artist {
    font-size: 13px;
    color: var(--c-text-secondary);
  }

  .tiny-dots {
    width: 28px;
    height: 28px;
    min-width: 28px;
    padding: 0;
    border-radius: 50%;
    color: var(--c-text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
  }
  .tiny-dots:hover {
    color: var(--c-text-primary);
    background: var(--c-white-10);
    opacity: 1;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .play-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--c-text-primary);
    color: var(--c-text-inverse);
    box-shadow: 0 4px 12px var(--c-shadow-card);
    transition: transform 0.1s;
    border: none;
  }
  .play-btn:hover {
    transform: scale(1.05);
  }
  .play-btn:active {
    transform: scale(0.95);
  }
  .play-btn :global(svg) {
    width: 24px;
    height: 24px;
  }

  .mode-btn {
    position: relative;
    opacity: 0.7;
    transition: opacity 0.2s;
  }
  .mode-btn.active {
    opacity: 1;
    color: var(--c-accent);
  }

  .btn-icon.liked {
    color: var(--c-heart);
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

  .volume {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .vol-btn-mini {
    background: transparent;
    border: none;
    color: var(--c-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    transition: color 0.2s;
  }
  .vol-btn-mini:hover {
    color: var(--c-text-primary);
    background: var(--c-white-10);
  }
  .vol-btn-mini :global(svg) {
    width: 20px;
    height: 20px;
  }

  .custom-slider {
    width: 150px;
    height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    position: relative;
  }

  .slider-bg {
    width: 100%;
    height: 4px;
    background: var(--c-border);
    border-radius: 2px;
    position: relative;
  }

  .slider-fill {
    height: 100%;
    background: var(--c-text-primary);
    border-radius: 2px;
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
  }

  .slider-knob {
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 1px 3px var(--c-black-40);
    pointer-events: none;
    transition: transform 0.1s;
  }

  .custom-slider:hover .slider-knob {
    transform: translate(-50%, -50%) scale(1.2);
  }

  @media (max-width: 768px) {
    .desktop {
      display: none !important;
    }
    .grid {
      grid-template-columns: 1fr max-content;
      padding: 0 16px;
    }
    .play-btn {
      width: 40px;
      height: 40px;
    }
    .art {
      width: 48px;
      height: 48px;
    }
  }
</style>
