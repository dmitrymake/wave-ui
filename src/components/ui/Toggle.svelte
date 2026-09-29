<!--
  Toggle (Switch) — design-system primitive (Wave UI)

  Replaces the .toggle-btn / .toggle-circle switch duplicated verbatim in
  ServicesSettings.svelte and AlarmSettings.svelte.

  Visual parity: track 44x24 (--switch-w / --switch-h), radius 12px (--radius-lg),
  1px border, knob 20px (--switch-knob), top/left 1px inset, .active -> accent bg,
  knob travel translateX(20px) with cubic-bezier(0.2,0.8,0.2,1) (== --trans-smooth).

  Accessibility upgrade over the raw legacy button: role=switch + aria-checked
  (these were MISSING on the original .toggle-btn). ariaLabel is required.
-->
<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    /** Required accessible name for the switch. */
    ariaLabel: string;
    name?: string;
    class?: string;
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    ariaLabel,
    name,
    class: className = "",
    onchange,
  }: Props = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (disabled) return;
    // Space / Enter toggle; arrows set explicit state (native-switch behaviour).
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle();
    } else if (event.key === "ArrowRight" && !checked) {
      event.preventDefault();
      toggle();
    } else if (event.key === "ArrowLeft" && checked) {
      event.preventDefault();
      toggle();
    }
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={ariaLabel}
  {name}
  {disabled}
  class="toggle {className}"
  class:is-checked={checked}
  onclick={toggle}
  onkeydown={handleKeydown}
>
  <span class="toggle__knob" aria-hidden="true"></span>
</button>

<style>
  .toggle {
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
    width: var(--switch-w); /* 44px */
    height: var(--switch-h); /* 24px */
    padding: var(--space-0);
    background: var(--c-surface-input);
    border: var(--border-default); /* 1px solid var(--c-border) */
    border-radius: var(--radius-lg); /* 12px */
    cursor: pointer;
    transition:
      background var(--trans-fast),
      border-color var(--trans-fast);
  }

  .toggle__knob {
    position: absolute;
    top: var(--space-px); /* 1px */
    left: var(--space-px); /* 1px */
    width: var(--switch-knob); /* 20px */
    height: var(--switch-knob);
    background: var(--c-text-primary);
    border-radius: var(--radius-circle);
    box-shadow: var(--shadow-xs);
    transition: transform var(--trans-smooth);
  }

  /* ---- Checked ---- */
  .toggle.is-checked {
    /* AA: dark label on the accent-btn fill, like the primary Button. */
    background: var(--c-accent-btn);
    border-color: var(--c-accent-btn);
  }
  .toggle.is-checked .toggle__knob {
    /* The knob sits 2px from the track's OUTER edge on each side: the 1px
       border plus the 1px inset (absolute positioning starts inside the
       border). travel = 44 - 20 - 2 * (1 + 1) = 20px. It used to leave the
       border out (22px), so a checked knob ran into the right edge with 0px to
       spare against 2px on the left. */
    transform: translateX(
      calc(var(--switch-w) - var(--switch-knob) - 2 * (var(--border-width-thin) + var(--space-px)))
    );
  }

  /* ---- States ---- */
  .toggle:disabled {
    opacity: var(--opacity-muted);
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle,
    .toggle__knob {
      transition: none;
    }
  }
</style>
