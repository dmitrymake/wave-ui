<script lang="ts">
  import * as MPD from "../lib/mpd";
  import { status } from "../lib/store.js";
  import { ICONS } from "../lib/icons";
  import { getVolumeIcon, getPct } from "../lib/playerHelpers";

  interface Props {
    compact?: boolean;
  }

  let { compact = false }: Props = $props();

  let isDraggingVol = false;
  let volumeBar: HTMLDivElement;
  let lastVolume = 50;

  let volumeIcon = $derived(getVolumeIcon($status.volume));

  function toggleMute(e?: MouseEvent) {
    if (e) e.stopPropagation();
    if ($status.volume > 0) {
      lastVolume = $status.volume;
      MPD.setVolume(0);
    } else {
      MPD.setVolume(lastVolume > 0 ? lastVolume : 30);
    }
  }

  function handleVolStart(e: MouseEvent | TouchEvent) {
    isDraggingVol = true;
    const vol = Math.round(getPct(e, volumeBar) * 100);
    MPD.setVolume(vol);
    window.addEventListener("mousemove", onVolMove);
    window.addEventListener("mouseup", onVolEnd);
    window.addEventListener("touchmove", onVolMove, { passive: false });
    window.addEventListener("touchend", onVolEnd);
  }

  function onVolMove(e: MouseEvent | TouchEvent) {
    if (!isDraggingVol) return;
    e.preventDefault();
    const vol = Math.round(getPct(e, volumeBar) * 100);
    MPD.setVolume(vol);
  }

  function onVolEnd() {
    isDraggingVol = false;
    window.removeEventListener("mousemove", onVolMove);
    window.removeEventListener("mouseup", onVolEnd);
    window.removeEventListener("touchmove", onVolMove);
    window.removeEventListener("touchend", onVolEnd);
  }
</script>

<div class="volume-row" class:compact onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
  <button class="vol-btn" onclick={toggleMute} title="Mute/Unmute">
    {@html volumeIcon}
  </button>

  <div
    class="volume-hit-area"
    bind:this={volumeBar}
    onmousedown={(e) => { e.stopPropagation(); handleVolStart(e); }}
    ontouchstart={(e) => { e.stopPropagation(); handleVolStart(e); }}
    role="slider"
    aria-label="Volume"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={$status.volume}
    tabindex="0"
  >
    <div class="common-track">
      <div class="common-fill" style="width: {$status.volume}%"></div>
      <div class="common-knob" style="left: {$status.volume}%; right: auto;"></div>
    </div>
  </div>

  {#if !compact}
    <div class="vol-icon-static">
      {@html ICONS.VOLUME_FULL}
    </div>
  {/if}
</div>

<style>
  .volume-row {
    display: flex;
    align-items: center;
    gap: 12px;
    opacity: 0.9;
    padding: 0 4px;
  }
  .compact {
    justify-content: flex-end;
  }

  .vol-btn {
    background: transparent;
    border: none;
    color: var(--c-text-secondary);
    padding: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: color 0.2s, background 0.2s;
  }
  .vol-btn:hover {
    color: var(--c-text-primary);
    background: var(--c-white-10);
  }
  .vol-btn :global(svg) { width: 24px; height: 24px; }
  .compact .vol-btn { padding: 4px; width: 32px; height: 32px; }
  .compact .vol-btn :global(svg) { width: 20px; height: 20px; }

  .volume-hit-area {
    flex: 1;
    height: 40px;
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: none;
    position: relative;
    width: 100%;
  }
  .compact .volume-hit-area {
    width: 150px;
    flex: none;
    height: 48px;
  }

  .common-track {
    width: 100%;
    height: 4px;
    background: var(--c-white-20);
    border-radius: 2px;
    position: relative;
  }
  .compact .common-track {
    background: var(--c-border);
  }

  .common-fill {
    height: 100%;
    background: var(--c-text-primary);
    border-radius: 2px;
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
  }

  .common-knob {
    position: absolute;
    top: 50%;
    transform: translateX(-50%);
    margin-top: -7px;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 2px 4px var(--c-black-50);
    pointer-events: none;
  }

  .vol-icon-static {
    color: var(--c-text-secondary);
    opacity: 0.5;
    display: flex;
    align-items: center;
  }
  .vol-icon-static :global(svg) { width: 20px; height: 20px; }
</style>
