<!--
  IconButton — design-system primitive (Wave UI)

  Naked / filled / overlay icon button replacing .btn-icon, .btn-icon.small,
  .side-btn, .vol-btn, .mode-btn, .like-btn, .tiny-dots, .card-menu-btn,
  .collapse-btn, .hamburger-btn, .clear-icon-btn, .clear-btn, .num-box,
  .context-menu-btn.

  Visual parity with shared.css:167-194 (.btn-icon: radius50%, pad 8px, svg 24px,
  :hover surface-hover, :active scale .95) and the per-component transport buttons.

  ariaLabel is REQUIRED (icon-only control has no readable text).
  Glyph is passed as the slot/children (an <svg>) and sized via --icon-size-* tokens,
  removing the legacy `svg { width: ... !important }` hacks.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Size = "sm" | "md" | "lg";
  type Shape = "circle" | "square";
  type Variant = "naked" | "filled" | "overlay";
  type Tone = "default" | "accent" | "heart";

  interface Props {
    /** Required accessible label — there is no visible text. */
    ariaLabel: string;
    size?: Size;
    shape?: Shape;
    variant?: Variant;
    tone?: Tone;
    /** Pressed/selected state (e.g. active play-mode, liked). */
    active?: boolean;
    disabled?: boolean;
    type?: "button" | "submit";
    title?: string;
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }

  let {
    ariaLabel,
    size = "lg",
    shape = "circle",
    variant = "naked",
    tone = "default",
    active = false,
    disabled = false,
    type = "button",
    title,
    class: className = "",
    onclick,
    children,
  }: Props = $props();

  function handleClick(event: MouseEvent) {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onclick?.(event);
  }
</script>

<button
  {type}
  class="ibtn ibtn--{size} ibtn--{shape} ibtn--{variant} ibtn--tone-{tone} {className}"
  class:is-active={active}
  aria-label={ariaLabel}
  aria-pressed={active}
  {title}
  {disabled}
  onclick={handleClick}
>
  {@render children?.()}
</button>

<style>
  .ibtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    background: transparent;
    border: none;
    color: var(--c-text-secondary);
    cursor: pointer;
    padding: var(--icon-btn-pad); /* 8px — legacy .btn-icon */
    transition: all var(--trans-fast);
  }

  /* ---- Shape ---- */
  .ibtn--circle {
    border-radius: var(--radius-circle);
  }
  .ibtn--square {
    border-radius: var(--radius-md);
  }

  /* ---- Glyph sizing (drives the slotted svg, no !important needed) ---- */
  .ibtn :global(svg) {
    display: block;
    stroke-width: var(--icon-stroke-width);
  }
  .ibtn--sm :global(svg) {
    width: var(--icon-size-sm); /* 18px */
    height: var(--icon-size-sm);
  }
  .ibtn--md :global(svg) {
    width: var(--icon-size-md); /* 20px */
    height: var(--icon-size-md);
  }
  .ibtn--lg :global(svg) {
    width: var(--icon-size-lg); /* 24px — most common transport/nav glyph */
    height: var(--icon-size-lg);
  }

  /* ---- Variants ---- */
  .ibtn--naked:hover:not(:disabled) {
    color: var(--c-text-primary);
    background: var(--c-surface-hover);
  }

  /* The filled variant is the header's icon button: a neutral surface with a
     white glyph, the same family as the secondary pill beside it. min-* aligns it
     to --control-h-lg (the pill height) while the glyph stays at size "md" —
     IconButton sizes the GLYPH, the box is glyph + 2 x padding. */
  .ibtn--filled {
    background: var(--c-surface-button);
    color: var(--c-text-primary);
    min-width: var(--control-h-lg);
    min-height: var(--control-h-lg);
  }
  .ibtn--filled:hover:not(:disabled) {
    background: var(--c-surface-button-hover);
  }

  /* overlay: semi-transparent chip revealed over media (e.g. card-menu-btn) */
  .ibtn--overlay {
    background: var(--c-black-20);
    color: var(--c-text-primary);
  }
  .ibtn--overlay:hover:not(:disabled) {
    background: var(--c-black-50);
  }

  /* ---- Tones / active ---- */
  /* A tone marks the ACTIVE state only. On hover the variant rules change the
     surface and nothing else: an accent glyph that turned red under the finger
     read as a state change that was not actually there. */
  .ibtn--tone-accent.is-active {
    color: var(--c-accent-btn);
  }
  .ibtn--tone-heart.is-active {
    color: var(--c-heart);
  }
  .ibtn--tone-default.is-active {
    color: var(--c-text-primary);
  }

  /* ---- States ---- */
  .ibtn:active:not(:disabled) {
    transform: scale(0.95);
  }
  /* Was --opacity-faint (0.5) while the Button next to it used 0.6: a row of
     disabled controls looked like two different states. */
  .ibtn:disabled {
    opacity: var(--opacity-muted);
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .ibtn {
      transition: none;
    }
  }
</style>
