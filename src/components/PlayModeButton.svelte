<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { PlayMode } from "../lib/playerActions";
  import { status } from "../lib/store.js";
  import { ICONS } from "../lib/icons";
  import { getPlayMode, cyclePlayMode } from "../lib/playerHelpers";

  interface Props {
    compact?: boolean;
    class?: string;
  }

  let { compact = false, class: className = "" }: Props = $props();

  let currentMode = $derived(getPlayMode($status));
  // 0 = off, 1 = shuffle, 2 = repeat.
  let modeLabel = $derived(
    currentMode === 2 ? "Repeat: on" : currentMode === 1 ? "Shuffle: on" : "Play mode: off",
  );

  function toggle(e?: MouseEvent) {
    if (e) e.stopPropagation();
    cyclePlayMode($status, PlayMode);
  }
</script>

<button
  class="btn-icon mode-btn {className}"
  class:active={currentMode > 0}
  class:compact
  onclick={toggle}
  aria-label={modeLabel}
  aria-pressed={currentMode > 0}
>
  {#if currentMode === 2}
    {@html ICONS.REPEAT}
  {:else}
    {@html ICONS.SHUFFLE}
  {/if}
  {#if currentMode > 0}<span class="dot"></span>{/if}
</button>

<style>
  .mode-btn {
    position: relative;
    color: var(--c-text-secondary);
    transition: color var(--dur-fast);
    padding: var(--icon-btn-pad-lg);
  }
  .mode-btn.active {
    color: var(--c-accent-btn);
  }
  .mode-btn:active { opacity: var(--opacity-dim); }
  .mode-btn :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); }

  /* Compact == the docked rail on 800x480: padding-sm (6px) + a 20px glyph was
     a 32px target, under the 44px minimum. */
  .compact { padding: var(--icon-btn-pad); opacity: var(--opacity-dim); }
  .compact.active { opacity: var(--opacity-visible); }
  .compact :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); }

  .dot {
    position: absolute;
    bottom: var(--space-2xs);
    width: var(--space-1);
    height: var(--space-1);
    background: var(--c-accent);
    border-radius: var(--radius-circle);
    left: 50%;
    transform: translateX(-50%);
  }
  .compact .dot { bottom: var(--space-0_5); width: var(--space-3px); height: var(--space-3px); }
</style>
