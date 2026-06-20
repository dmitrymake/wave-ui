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
    color: var(--c-accent);
  }
  .mode-btn:active { opacity: var(--opacity-dim); }
  .mode-btn :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); }

  .compact { padding: var(--icon-btn-pad-sm); opacity: var(--opacity-dim); }
  .compact.active { opacity: var(--opacity-visible); }
  .compact :global(svg) { width: var(--icon-size-md); height: var(--icon-size-md); }

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
