<!--
  Card — design-system primitive (Wave UI)

  Surface / popover container replacing the settings .card, ContextMenu .menu-card,
  Modal .modal-card and PlaylistSearchResults .group-card.

  (The media grid card .music-card stays a distinct component because of its
  cover/overlay/hover-lift specifics.)

  Visual parity:
    - variant "surface" (default) == settings .card: bg-card, 1px border, radius 12px (--radius-lg), padding 16px.
    - variant "popover" == menu/modal card: bg-card, 1px border, radius 12px, shadow.
  Styled ONLY with tokens. Renders as <div> by default, or <button> when clickable.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Variant = "surface" | "popover";
  type Padding = "none" | "sm" | "md";

  interface Props {
    variant?: Variant;
    padding?: Padding;
    /** Makes the card an interactive button with press feedback. */
    clickable?: boolean;
    ariaLabel?: string;
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }

  let {
    variant = "surface",
    padding = "md",
    clickable = false,
    ariaLabel,
    class: className = "",
    onclick,
    children,
  }: Props = $props();
</script>

{#if clickable}
  <button
    type="button"
    class="card card--{variant} card--pad-{padding} card--clickable {className}"
    aria-label={ariaLabel}
    {onclick}
  >
    {@render children?.()}
  </button>
{:else}
  <div class="card card--{variant} card--pad-{padding} {className}">
    {@render children?.()}
  </div>
{/if}

<style>
  .card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--space-3); /* 12px — settings .card gap */
    background: var(--c-bg-card);
    border-radius: var(--radius-lg); /* 12px */
    border: var(--border-default); /* 1px solid var(--c-border) */
    color: var(--c-text-primary);
    text-align: left;
    width: 100%;
  }

  /* ---- Variant ---- */
  /* .card--surface uses the base .card surface (border only) — no extra rules. */
  .card--popover {
    box-shadow: var(--shadow-xl);
  }

  /* ---- Padding ---- */
  .card--pad-none {
    padding: var(--space-0);
  }
  .card--pad-sm {
    padding: var(--space-3); /* 12px */
  }
  .card--pad-md {
    padding: var(--space-4); /* 16px */
  }

  /* ---- Clickable ---- */
  .card--clickable {
    font: inherit;
    cursor: pointer;
    transition: background var(--trans-fast);
  }
  .card--clickable:hover {
    background: var(--c-surface-hover);
  }
  .card--clickable:active {
    background: var(--c-surface-hover);
    transform: scale(0.99);
  }
  .card--clickable:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus-ring);
  }

  @media (prefers-reduced-motion: reduce) {
    .card--clickable {
      transition: none;
    }
  }
</style>
