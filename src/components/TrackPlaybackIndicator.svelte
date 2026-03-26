<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../lib/icons";

  interface Props {
    index: number;
    isExactActive?: boolean;
    isPlaying?: boolean;
    isHovering?: boolean;
    onaction?: () => void;
  }

  let { index, isExactActive = false, isPlaying = false, isHovering = false, onaction }: Props = $props();

  let showPause = $derived(isExactActive && isPlaying && isHovering);
  let showEq = $derived(isExactActive && isPlaying && !isHovering);
  let showStatic = $derived(isExactActive && !isPlaying && !isHovering);
  let showPlay = $derived(isHovering && !showPause);
</script>

<button class="num-box" onclick={onaction}>
  {#if showEq}
    <div class="eq-anim">
      <span class="bar b1"></span>
      <span class="bar b2"></span>
      <span class="bar b3"></span>
    </div>
  {:else if showPause}
    <div class="icon-small">{@html ICONS.PAUSE}</div>
  {:else if showPlay}
    <div class="icon-small">{@html ICONS.PLAY}</div>
  {:else if showStatic}
    <div class="icon-small accent">{@html ICONS.PLAY}</div>
  {:else}
    <span class="num" class:active={isExactActive}>{index + 1}</span>
  {/if}
</button>

<style>
  .num-box {
    width: 24px;
    height: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    flex-shrink: 0;
  }
  .num {
    font-size: 14px;
    color: var(--c-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .num.active {
    color: var(--c-accent);
    font-weight: 700;
  }

  .icon-small {
    width: 16px;
    height: 16px;
    display: flex;
    fill: var(--c-text-primary);
  }
  .icon-small :global(svg) { width: 100%; height: 100%; }
  .icon-small.accent { color: var(--c-accent); }

  .eq-anim {
    display: flex;
    align-items: flex-end;
    height: 12px;
    width: 13px;
    justify-content: center;
  }
  .bar {
    width: 3px;
    background: var(--c-accent);
    margin: 0 1px;
    border-radius: 1px;
  }
  .b1 { animation: eq 0.6s infinite ease-in-out; }
  .b2 { animation: eq 0.6s infinite ease-in-out 0.2s; }
  .b3 { animation: eq 0.6s infinite ease-in-out 0.4s; }
  @keyframes eq {
    0%, 100% { height: 3px; }
    50% { height: 12px; }
  }
</style>
