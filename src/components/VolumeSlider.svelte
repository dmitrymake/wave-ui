<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { setVolume } from "../lib/playerActions";
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
      setVolume(0);
    } else {
      setVolume(lastVolume > 0 ? lastVolume : 30);
    }
  }

  function handleVolStart(e: MouseEvent | TouchEvent) {
    isDraggingVol = true;
    const vol = Math.round(getPct(e, volumeBar) * 100);
    setVolume(vol);
    window.addEventListener("mousemove", onVolMove);
    window.addEventListener("mouseup", onVolEnd);
    window.addEventListener("touchmove", onVolMove, { passive: false });
    window.addEventListener("touchend", onVolEnd);
  }

  function onVolMove(e: MouseEvent | TouchEvent) {
    if (!isDraggingVol) return;
    e.preventDefault();
    const vol = Math.round(getPct(e, volumeBar) * 100);
    setVolume(vol);
  }

  function onVolEnd() {
    isDraggingVol = false;
    window.removeEventListener("mousemove", onVolMove);
    window.removeEventListener("mouseup", onVolEnd);
    window.removeEventListener("touchmove", onVolMove);
    window.removeEventListener("touchend", onVolEnd);
  }

  // If the component is unmounted mid-drag, the window listeners added in
  // handleVolStart would otherwise leak. Clear drag state and detach them.
  onDestroy(onVolEnd);
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
    gap: var(--space-3);
    opacity: 0.9;
    padding: var(--space-0) var(--space-1);
  }
  .compact {
    justify-content: flex-end;
  }

  .vol-btn {
    background: transparent;
    border: none;
    color: var(--c-text-secondary);
    padding: var(--icon-btn-pad);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-circle);
    transition: color var(--dur-fast), background var(--dur-fast);
  }
  .vol-btn:hover {
    color: var(--c-text-primary);
    background: var(--c-white-10);
  }
  .vol-btn :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); }
  .compact .vol-btn { padding: var(--space-1); width: var(--control-h-sm); height: var(--control-h-sm); }
  .compact .vol-btn :global(svg) { width: var(--icon-size-md); height: var(--icon-size-md); }

  .volume-hit-area {
    flex: 1;
    height: var(--control-h-lg);
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
    height: var(--control-h-xl);
  }

  .common-track {
    width: 100%;
    height: var(--space-1);
    background: var(--c-white-20);
    border-radius: var(--radius-xs);
    position: relative;
  }
  .compact .common-track {
    background: var(--c-border);
  }

  .common-fill {
    height: 100%;
    background: var(--c-text-primary);
    border-radius: var(--radius-xs);
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
  }

  .common-knob {
    position: absolute;
    top: 50%;
    transform: translateX(-50%);
    margin-top: calc(-1 * var(--space-7px));
    width: 14px;
    height: 14px;
    background: var(--c-text-primary);
    border-radius: var(--radius-circle);
    box-shadow: var(--shadow-sm-strong);
    pointer-events: none;
  }

  .vol-icon-static {
    color: var(--c-text-secondary);
    opacity: var(--opacity-faint);
    display: flex;
    align-items: center;
  }
  .vol-icon-static :global(svg) { width: var(--icon-size-md); height: var(--icon-size-md); }
</style>
