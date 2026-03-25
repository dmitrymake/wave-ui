<script lang="ts">
  import * as MPD from "../lib/mpd";
  import { ICONS } from "../lib/icons";
  import {
    currentSong,
    status,
    isFullPlayerOpen,
    getTrackCoverUrl,
    stations,
    openContextMenu,
  } from "../lib/store.js";
  import { longpress } from "../lib/actions";
  import { formatTime, getPct, isRadioStream, getQualityLabel } from "../lib/playerHelpers";
  import ImageLoader from "./ImageLoader.svelte";
  import VolumeSlider from "./VolumeSlider.svelte";
  import PlayModeButton from "./PlayModeButton.svelte";
  import LikeButton from "./LikeButton.svelte";

  let isHoveringBar = $state(false);
  let isDragging = $state(false);
  let dragProgress = $state(0);
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
  let pct = $derived(isRadio ? 0 : isDragging ? dragProgress * 100 : (elapsed / duration) * 100);
  let smooth = $derived(isPlaying && !isDragging && !isRadio);
  let qualityLabel = $derived(getQualityLabel($status));

  function handleMouseDown(e: MouseEvent) {
    if (isRadio) return;
    isDragging = true;
    dragProgress = getPct(e, progressBar);
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);
  }

  function onWinMove(e: MouseEvent) {
    if (isDragging) dragProgress = getPct(e, progressBar);
  }

  function onWinUp() {
    if (isDragging && !isRadio) {
      MPD.seek(dragProgress * duration);
    }
    isDragging = false;
    window.removeEventListener("mousemove", onWinMove);
    window.removeEventListener("mouseup", onWinUp);
  }

  function handleContext(e: MouseEvent) {
    e.stopPropagation();
    openContextMenu(e, $currentSong, { type: "general", source: "miniplayer" });
  }

  function handleLongPress(e: CustomEvent<{ originalEvent: MouseEvent | TouchEvent }>) {
    openContextMenu(e.detail.originalEvent, $currentSong, { type: "general", source: "miniplayer" });
  }
</script>

{#if !$isFullPlayerOpen}
  <div
    class="dock"
    onclick={() => isFullPlayerOpen.set(true)}
    use:longpress={500}
    onlongpress={handleLongPress}
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
      onmousedown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
      onclick={(e) => e.stopPropagation()}
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
          {isDragging ? formatTime(dragProgress * duration) : formatTime(elapsed)}
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

        <button class="btn-icon" onclick={stop(() => MPD.nav("previous"))}>
          {@html ICONS.PREVIOUS}
        </button>

        <button class="play-btn flex-center" onclick={stop(MPD.togglePlay)}>
          {@html $status.state === "play" ? ICONS.PAUSE : ICONS.PLAY}
        </button>

        <button class="btn-icon" onclick={stop(() => MPD.nav("next"))}>
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
  }
</style>
