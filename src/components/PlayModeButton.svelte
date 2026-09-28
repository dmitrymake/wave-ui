<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { PlayMode } from "../lib/playerActions";
  import { status } from "../lib/store.js";
  import { ICONS } from "../lib/icons";
  import { getPlayMode, cyclePlayMode } from "../lib/playerHelpers";
  import IconButton from "./ui/IconButton.svelte";

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
  let isOn = $derived(currentMode > 0);

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    cyclePlayMode($status, PlayMode);
  }
</script>

<!-- The one icon button that is not a single glyph: the active dot is extra
     markup, so the content goes through `children` instead of `icon`. -->
<IconButton
  class="{isOn ? 'mode-on ' : ''}{compact ? 'mode-docked ' : ''}{className}"
  size="lg"
  tone="accent"
  active={isOn}
  ariaLabel={modeLabel}
  onclick={toggle}
>
  {@html currentMode === 2 ? ICONS.REPEAT : ICONS.SHUFFLE}
  {#if isOn}<span class="dot"></span>{/if}
</IconButton>

<style>
  /* :global() because the classes travel through the primitive's class prop, and
     prefixed because a global ".on"/".docked" would be a magnet for every other
     element in the app. */
  :global(.mode-on) {
    position: relative; /* the dot below hangs off the button */
  }

  /* The docked rail keeps the button quiet until a mode is on. */
  :global(.mode-docked) {
    opacity: var(--opacity-dim);
  }
  :global(.mode-docked.mode-on) {
    opacity: var(--opacity-visible);
  }

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
</style>
