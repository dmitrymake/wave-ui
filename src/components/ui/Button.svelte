<!--
  Button — design-system primitive (Wave UI)

  Pill button replacing the legacy .btn-primary / .btn-secondary / .btn-action(text)
  and Modal .btn / .btn.cancel / .btn.confirm. Visual parity with MusicViews.css:446-518
  (pill geometry, accent primary, surface secondary) and Modal.svelte (footer buttons).

  Styled ONLY with design tokens (var(--space-*), var(--text-*), var(--radius-*), ...).
  No business logic. Accessible: native <button>; the shared gray focus fill
   (src/styles/shared.css), disabled via the native attribute.

  Parity notes:
    - default size "md" == legacy 40px pill (--control-h-lg, pad 0 --control-pad-x-md, font 14/700).
    - size "sm" == legacy .small / .btn-action mobile (36px, pad 0 16px, font 13).
    - size "lg" == md height with larger horizontal padding.
    - ONE casing for every variant: the label as written, in Title Case ("Play All",
      "To Queue", "Stop Stream", "Save"). The primary used to be uppercased and
      tracked while the secondary beside it was not, so the two buttons of one
      header read as two different systems. The fill says "primary"; the
      casing does not have to. Tracked caps belong to the eyebrow alone.
    - pill radius via --radius-pill (= --radius-full) to avoid the gruvbox --radius-xl drift.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  // No "ghost": the outlined icon button it existed for is now IconButton
  // variant="filled" (a neutral surface), which matches the pills next to it.
  type Variant = "primary" | "secondary";
  type Size = "sm" | "md" | "lg";

  interface Props {
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    /** Icon-only mode: square hit target, no horizontal padding, centered glyph. */
    icon?: boolean;
    /** Accessible label — REQUIRED when icon-only (no readable text). */
    ariaLabel?: string;
    /** Forwarded to the native title attribute (tooltip). */
    title?: string;
    /** Stretch to fill the parent (e.g. Modal footer flex:1). */
    block?: boolean;
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }
  let {
    variant = "secondary",
    size = "md",
    disabled = false,
    type = "button",
    icon = false,
    ariaLabel,
    title,
    block = false,
    class: className = "",
    onclick,
    children,
  }: Props = $props();

  const isDisabled = $derived(disabled);

  function handleClick(event: MouseEvent) {
    if (isDisabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onclick?.(event);
  }
</script>

<button
  {type}
  class="btn btn--{variant} btn--{size} {className}"
  class:btn--icon={icon}
  class:btn--block={block}
  disabled={isDisabled}
  aria-label={ariaLabel}
  {title}
  onclick={handleClick}
>
  <span class="btn__content">
    {@render children?.()}
  </span>
</button>

<style>
  .btn {
    /* shape & layout */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* No gap here: the label and the glyph inside a button are children of
       .btn__content, so that is the one box that owns the 8px between them.
       Two owners for one gap means the number can be right in one and wrong in
       the other. */
    white-space: nowrap;
    box-sizing: border-box;
    border: var(--border-width-thin) solid transparent;
    border-radius: var(--radius-pill);

    /* typography */
    font-family: var(--font-sans);
    font-size: var(--text-control);
    font-weight: var(--weight-control);
    line-height: var(--leading-none);

    /* interaction */
    cursor: pointer;
    position: relative;
    transition:
      transform var(--dur-instant) var(--ease-default),
      background var(--dur-fast) var(--ease-default),
      border-color var(--dur-fast) var(--ease-default),
      color var(--dur-fast) var(--ease-default),
      opacity var(--dur-fast) var(--ease-default);
  }

  /* ---- Sizes (height + horizontal padding) ---- */
  .btn--sm {
    height: var(--control-h-md); /* 36px */
    padding: 0 var(--control-pad-x-sm); /* 0 16px */
    font-size: var(--text-base); /* 14px */
  }
  .btn--md {
    height: var(--control-h-lg); /* 40px */
    padding: 0 var(--control-pad-x-md); /* 0 20px */
  }
  .btn--lg {
    height: var(--control-h-lg); /* 40px */
    padding: 0 var(--space-6); /* 0 24px */
  }

  /* ---- Variants ---- */
  .btn--primary {
    /* AA-safe: dark label on accent fill. default #fa2d48+#000=5.53:1;
       gruvbox #fe8019+#282828=5.84:1 (plain --c-accent would be 3.41:1). */
    background: var(--c-accent-btn);
    color: var(--c-text-inverse);
  }
  /* Hover only where there is one (see IconButton): no sticky plate after a tap. */
  @media (hover: hover) {
    .btn--primary:hover:not(:disabled) {
      background: var(--c-accent-btn-hover);
    }
    .btn--secondary:hover:not(:disabled) {
      background: var(--c-surface-button-hover);
    }
  }

  .btn--secondary {
    background: var(--c-surface-button);
    color: var(--c-text-primary);
  }
  .btn--secondary:active:not(:disabled) {
    background: var(--c-surface-active);
  }

  /* ---- Icon-only mode (square, centered glyph) ---- */
  .btn--icon {
    padding: 0;
    gap: 0;
  }
  .btn--icon.btn--sm {
    width: var(--control-h-md); /* 36px square */
  }
  .btn--icon.btn--md {
    width: var(--control-h-lg); /* 40px square */
  }
  .btn--icon.btn--lg {
    width: var(--control-h-lg);
  }
  .btn--icon :global(svg) {
    width: var(--icon-size-sm); /* 18px — legacy .btn-action svg */
    height: var(--icon-size-sm);
    stroke-width: var(--icon-stroke-width);
  }

  /* ---- Block / states ---- */
  .btn--block {
    width: 100%;
    flex: 1;
  }

  .btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  /* Touch: the 44px floor. min-height/min-width, so the pill keeps its own
     padding and only a box that was smaller than the floor grows. */
  @media (pointer: coarse) {
    .btn {
      min-height: var(--target-touch);
    }
    .btn--icon {
      min-width: var(--target-touch);
    }
  }

  .btn:disabled {
    opacity: var(--opacity-muted);
    cursor: default;
  }

  /* ---- Layout ----
     The 8px between a button's label and its glyph — one owner, the box that
     actually holds them. */
  .btn__content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .btn {
      transition: none;
    }
  }
</style>
