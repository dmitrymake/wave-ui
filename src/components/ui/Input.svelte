<!--
  Input — design-system primitive (Wave UI)

  Text field + search variant, unifying:
    - Modal .modal-input (pad 10px 12px, radius 8px, font 14, :focus border-accent)
    - settings text/password inputs (pad 8px 12px, radius 8px, font 14)
    - the canonical .search-input-container (48px, radius 12px, pad 0 16px, font 16, :focus-within)
    - the lighter list/Yandex search containers (radius 8px, pad 8px 12px, font 15)
    - the duplicated .clear-icon-btn / .clear-btn trailing clear control.

  `search` adds a leading magnifier (slot `icon`) and a trailing clear IconButton.
  Styled ONLY with tokens. Accessible: label association via aria-label, type=search
  semantics, focus ring on the wrapper, role-clean clear button with its own aria-label.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import IconButton from "./IconButton.svelte";

  // The trailing cross, inlined rather than added to the ICONS map: it is the
  // one glyph that belongs to the field, not to a view.
  const CLEAR_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">' +
    '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>';

  type Size = "sm" | "md";

  interface Props {
    value?: string;
    type?: "text" | "search" | "password" | "email" | "url" | "number" | "time";
    placeholder?: string;
    /** Renders as a search field: leading icon slot + trailing clear button. */
    search?: boolean;
    size?: Size;
    disabled?: boolean;
    readonly?: boolean;
    error?: boolean;
    /** Accessible name (no visible <label> in this primitive). */
    ariaLabel?: string;
    name?: string;
    autocomplete?: import("svelte/elements").FullAutoFill;
    /** When true (default for search), shows the clear button while value is non-empty. */
    clearable?: boolean;
    class?: string;
    oninput?: (event: Event) => void;
    onkeydown?: (event: KeyboardEvent) => void;
    onclear?: () => void;
    /** Leading icon (typically a magnifier <svg>) for search inputs. */
    icon?: Snippet;
    /**
     * Extra trailing content inside the field (e.g. a loading spinner),
     * rendered after the input and before the clear button.
     */
    trailing?: Snippet;
    /** Native autofocus for the inner input (e.g. the library Search view). */
    autofocus?: boolean;
  }

  let {
    value = $bindable(""),
    type = "text",
    placeholder = "",
    search = false,
    size = "md",
    disabled = false,
    readonly = false,
    error = false,
    ariaLabel,
    name,
    autocomplete,
    clearable = true,
    class: className = "",
    oninput,
    onkeydown,
    onclear,
    icon,
    trailing,
    autofocus = false,
  }: Props = $props();

  const effectiveType = $derived(search ? "search" : type);
  const showClear = $derived(search && clearable && !disabled && value.length > 0);

  function handleClear() {
    value = "";
    onclear?.();
  }
</script>

<div
  class="field field--{size} {className}"
  class:field--search={search}
  class:is-error={error}
  class:is-disabled={disabled}
>
  {#if search}
    <span class="field__icon" aria-hidden="true">
      {@render icon?.()}
    </span>
  {/if}

  <!-- autofocus is opt-in (search-first views) and therefore exempt -->
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="field__input"
    type={effectiveType}
    bind:value
    {placeholder}
    {disabled}
    {readonly}
    {name}
    {autocomplete}
    aria-label={ariaLabel}
    aria-invalid={error}
    {oninput}
    {onkeydown}
    {autofocus}
  />

  {#if trailing}
    <span class="field__trailing" aria-hidden="true">
      {@render trailing()}
    </span>
  {/if}

  {#if showClear}
    <IconButton
      class="field__clear"
      size="xs"
      ariaLabel="Clear"
      icon={CLEAR_ICON}
      onclick={handleClear}
    />
  {/if}
</div>

<style>
  .field {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    width: 100%;
    background: var(--c-surface-input);
    border: var(--border-default); /* 1px solid var(--c-border) */
    color: var(--c-text-primary);
    border-radius: var(--radius-md); /* 8px — modal/list inputs */
    transition:
      background var(--trans-fast),
      border-color var(--trans-fast);
  }

  /* ---- Sizes ---- */
  .field--sm {
    min-height: var(--control-h-md); /* 36px */
    padding: var(--space-2) var(--space-3); /* 8px 12px */
    font-size: var(--text-lg); /* 16px — list/Yandex search */
  }
  .field--md {
    min-height: var(--control-h-lg); /* 40px */
    padding: var(--space-3) var(--space-3); /* 12px 12px — modal-input */
    font-size: var(--text-base); /* 14px */
  }

  /* search wrapper takes the canonical 48px / radius-lg / horizontal inset */
  .field--search {
    height: var(--control-h-xl); /* 48px */
    min-height: var(--control-h-xl);
    padding: var(--space-0) var(--space-4); /* 0 16px */
    border-radius: var(--radius-lg); /* 12px */
    border-color: var(--c-border);
    gap: var(--space-3); /* 12px between icon / input */
  }
  .field--search.field--sm {
    height: var(--control-h-md); /* 36px compact search */
    min-height: var(--control-h-md);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
  }

  /* ---- Input element ---- */
  .field__input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    color: inherit;
    font: inherit;
    font-family: var(--font-sans);
    padding: var(--space-0);
    margin: var(--space-0);
  }
  /* iOS-zoom-safe size for the wide search field */
  .field--search .field__input {
    font-size: var(--text-lg); /* 16px */
  }
  .field--search.field--sm .field__input {
    font-size: var(--text-lg); /* 16px */
  }
  .field__input::placeholder {
    color: var(--c-text-secondary);
  }

  /* ---- Leading icon ---- */
  .field__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--c-icon-idle);
  }
  .field__icon :global(svg) {
    width: var(--icon-size-md); /* 20px */
    height: var(--icon-size-md);
    stroke-width: var(--icon-stroke-width);
  }

  /* ---- Extra trailing content (e.g. spinner) ---- */
  .field__trailing {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ---- Trailing clear button ---- */
  /* The clear glyph spans the field's height like the text baseline does, so
     only that stretch is local — the control itself is the shared primitive. */
  .field :global(.field__clear) {
    flex-shrink: 0;
    width: var(--switch-h); /* 24px */
    height: 100%;
    margin-left: var(--space-1); /* 4px */
    color: var(--c-text-muted);
  }
  .field :global(.field__clear:hover) {
    color: var(--c-text-primary);
  }
  /* ---- States ---- */
  /* Text fields show a brighter gray border instead of a plate (the field is
     already a filled surface), using the same neutral focus color family. */
  .field:focus-within {
    background: var(--c-surface-input-focus);
    border-color: var(--c-focus-line);
  }
  .field.is-error {
    border-color: var(--c-error);
    box-shadow: var(--shadow-error-ring);
  }
  .field.is-disabled {
    opacity: var(--opacity-muted);
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .field,
    .field__clear {
      transition: none;
    }
  }
</style>
