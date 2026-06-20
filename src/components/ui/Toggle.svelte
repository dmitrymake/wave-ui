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
    background: var(--c-accent);
    border-color: var(--c-accent);
  }
  .toggle.is-checked .toggle__knob {
    /* travel = --switch-w - --switch-knob - 2 * 1px inset = 20px */
    transform: translateX(
      calc(var(--switch-w) - var(--switch-knob) - 2 * var(--space-px))
    );
  }

  /* ---- States ---- */
  .toggle:disabled {
    opacity: var(--opacity-faint);
    cursor: default;
  }
  .toggle:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus-ring);
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle,
    .toggle__knob {
      transition: none;
    }
  }
</style>
