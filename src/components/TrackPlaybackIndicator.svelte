<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { ICONS } from "../lib/icons";

  // Coarse pointer = touchscreen: there is no hover state to react to, so the
  // glyph has to come from the row's own state instead.
  const hasHover = window.matchMedia?.("(hover: hover)")?.matches ?? true;

  interface Props {
    index: number;
    isExactActive?: boolean;
    isPlaying?: boolean;
    isHovering?: boolean;
    onaction?: () => void;
  }

  let { index, isExactActive = false, isPlaying = false, isHovering = false, onaction }: Props = $props();

  // On a touchscreen :hover never fires, so the play/pause glyph swapped only
  // for a mouse user. Hover still wins when it happens; otherwise the row's own
  // state decides — the current track always shows what tapping it will do.
  let showPause = $derived(isExactActive && isPlaying && (isHovering || !hasHover));
  let showEq = $derived(isExactActive && isPlaying && !showPause);
  let showStatic = $derived(isExactActive && !isPlaying && !isHovering);
  let showPlay = $derived(isHovering && !showPause);
  let isActivePlaying = $derived(isExactActive && isPlaying);
</script>

<button
  class="num-box"
  onclick={onaction}
  aria-label={isActivePlaying ? "Pause" : `Play track ${index + 1}`}
  aria-current={isExactActive}
>
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
    /* 28px fits three digits at --text-base tabular-nums; 24px overflowed onto
       the cover once a playlist passed 99 tracks. min-width keeps the hit area
       for two-digit numbers without shifting the row. */
    width: 28px;
    min-width: 28px;
    height: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
    border: none;
    padding: var(--space-0);
    cursor: pointer;
    flex-shrink: 0;
    /* Tappable on its own: circle, like every other icon button. */
    border-radius: var(--radius-circle);
  }
  .num {
    font-size: var(--text-base);
    color: var(--c-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .num.active {
    color: var(--c-accent-btn);
    font-weight: var(--weight-bold);
  }

  .icon-small {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    display: flex;
    fill: var(--c-text-primary);
  }
  .icon-small :global(svg) { width: 100%; height: 100%; }
  .icon-small.accent { color: var(--c-accent-btn); }

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
    border-radius: var(--radius-xs);
  }
  .b1 { animation: eq 0.6s infinite ease-in-out; }
  .b2 { animation: eq 0.6s infinite ease-in-out 0.2s; }
  .b3 { animation: eq 0.6s infinite ease-in-out 0.4s; }
  @keyframes eq {
    0%, 100% { height: 3px; }
    50% { height: 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .b1, .b2, .b3 { animation: none; }
  }
</style>
