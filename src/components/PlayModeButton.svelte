<script lang="ts">
  import * as MPD from "../lib/mpd";
  import { status } from "../lib/store.js";
  import { ICONS } from "../lib/icons";
  import { getPlayMode, cyclePlayMode } from "../lib/playerHelpers";

  interface Props {
    compact?: boolean;
  }

  let { compact = false }: Props = $props();

  let currentMode = $derived(getPlayMode($status));

  function toggle(e?: MouseEvent) {
    if (e) e.stopPropagation();
    cyclePlayMode(currentMode, MPD);
  }
</script>

<button
  class="btn-icon mode-btn"
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
    transition: color 0.2s;
    padding: 10px;
  }
  .mode-btn.active {
    color: var(--c-accent);
  }
  .mode-btn:active { opacity: 0.7; }
  .mode-btn :global(svg) { width: 24px; height: 24px; }

  .compact { padding: 6px; opacity: 0.7; }
  .compact.active { opacity: 1; }
  .compact :global(svg) { width: 20px; height: 20px; }

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
  .compact .dot { bottom: 2px; width: 3px; height: 3px; }
</style>
