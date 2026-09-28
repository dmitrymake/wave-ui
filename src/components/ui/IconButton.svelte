<!--
  IconButton — the one icon-only button in Wave UI (naked / filled / overlay).

  Replaces the hand-rolled copies it was written for: .btn-icon and
  .btn-icon.small (shared.css / MusicViews.css), .side-btn, .vol-btn, .mode-btn,
  .like-btn, .tiny-dots, .card-menu-btn, .hamburger-btn, .clear-icon-btn,
  .field__clear and .context-menu-btn.

  Two ideas make the call sites shorter AND the look identical everywhere:
  - `size` names the TAP TARGET, not the glyph. Before, the box was an accident
    of "glyph + 2 x padding", so a 32px chip and a 40px row action came out of
    the same markup and read as different controls. Targets are now 40px, with
    32px (xs) reserved for the chips that sit on top of media.
  - `icon` takes an ICONS.* constant directly, so a plain glyph is one line of
    markup. `children` stays for the rare case that is not a single glyph
    (PlayModeButton's active dot).

  ariaLabel is REQUIRED: an icon-only control has no readable text.
  Callers that only need layout (position, hidden-until-hover) pass `class`.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Size = "xs" | "sm" | "md" | "lg";
  type Variant = "naked" | "filled" | "overlay";
  type Tone = "default" | "accent" | "heart";

  interface Props {
    /** Required accessible label — there is no visible text. */
    ariaLabel: string;
    /** SVG markup, normally an ICONS.* constant. Ignored when `children` is given. */
    icon?: string;
    size?: Size;
    variant?: Variant;
    tone?: Tone;
    /** Pressed/selected state (e.g. active play-mode, liked). */
    active?: boolean;
    disabled?: boolean;
    title?: string;
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }

  let {
    ariaLabel,
    icon,
    size = "lg",
    variant = "naked",
    tone = "default",
    active = false,
    disabled = false,
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
  type="button"
  class="ibtn ibtn--{size} ibtn--{variant} ibtn--tone-{tone} {className}"
  class:is-active={active}
  aria-label={ariaLabel}
  aria-pressed={active}
  {title}
  {disabled}
  onclick={handleClick}
>
  {#if children}{@render children()}{:else}{@html icon}{/if}
</button>

<style>
  .ibtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    /* 40px, the app's tap target (>= WCAG 2.5.8) — the same height as the
       labelled pills, so a bare glyph never looks smaller than its neighbour. */
    width: var(--control-h-lg);
    height: var(--control-h-lg);
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-circle);
    color: var(--c-text-secondary);
    cursor: pointer;
    transition:
      color var(--trans-fast),
      background var(--trans-fast),
      transform var(--trans-fast);
  }

  /* ---- Glyph: sized for optical balance inside the target, and stroked with
     the same --icon-stroke-width everywhere (a 24px Tabler stroke rendered at
     18px without this reads as a thick glyph in a thin circle). ---- */
  .ibtn :global(svg) {
    display: block;
    stroke-width: var(--icon-stroke-width);
  }
  .ibtn--xs {
    /* 32px chip: sits on a cover, so it must not cover it. */
    width: var(--control-h-sm);
    height: var(--control-h-sm);
  }
  .ibtn--xs :global(svg) {
    width: var(--icon-size-xs); /* 16px */
    height: var(--icon-size-xs);
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
    width: var(--icon-size-lg); /* 24px — transport, nav, close */
    height: var(--icon-size-lg);
  }

  /* ---- Variants ---- */
  .ibtn--naked:hover:not(:disabled) {
    color: var(--c-text-primary);
    background: var(--c-surface-hover);
  }

  /* filled: the header's icon button — a neutral surface with a white glyph,
     the same family as the secondary pill beside it. */
  .ibtn--filled {
    background: var(--c-surface-button);
    color: var(--c-text-primary);
  }
  .ibtn--filled:hover:not(:disabled) {
    background: var(--c-surface-button-hover);
  }

  /* overlay: a chip revealed on top of media (e.g. the card menu). */
  .ibtn--overlay {
    background: var(--c-black-20);
    color: var(--c-text-primary);
  }
  .ibtn--overlay:hover:not(:disabled) {
    background: var(--c-black-50);
  }

  /* ---- Tones ----
     A tone marks the ACTIVE state only. On hover the variant rules change the
     surface and nothing else: an accent glyph that turned red under the finger
     read as a state change that was not actually there. */
  .ibtn--tone-accent.is-active {
    color: var(--c-accent-btn);
  }
  .ibtn--tone-heart.is-active {
    color: var(--c-heart);
  }
  /* The heart acknowledges the tap: one short swell, no motion elsewhere. */
  .ibtn--tone-heart.is-active :global(svg) {
    animation: ibtn-heart-pop var(--dur-base) var(--ease-emphasized);
  }
  @keyframes ibtn-heart-pop {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.2);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ibtn--tone-heart.is-active :global(svg) {
      animation: none;
    }
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
