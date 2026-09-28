<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<!--
  SearchBar — shared search field (Wave UI).

  The canonical 48px search bar (radius-lg, pad 0 16px, font 16) previously
  lived as copy-pasted `.search-input-container` markup in SearchView /
  LibraryView / PlaylistsView, while Yandex used a compact 36px `sm` variant.
  Both now render this one component, so the library Search bar and the Yandex
  bar are the same control with different placeholders.

  Presentational only: debounce, stores and navigation stay in the parent,
  which passes `value` (bindable), `oninput` and `onClear`. Optional `busy`
  shows an in-field spinner (library Search), `autofocus` focuses on mount.
-->
<script lang="ts">
  import { ICONS } from "../../lib/icons";
  import Input from "./Input.svelte";

  let {
    value = $bindable(""),
    placeholder = "Search",
    ariaLabel = "Search",
    oninput,
    onClear,
    autofocus = false,
    busy = false,
    disabled = false,
  }: {
    value?: string;
    placeholder?: string;
    ariaLabel?: string;
    oninput?: (e: Event) => void;
    onClear?: () => void;
    autofocus?: boolean;
    busy?: boolean;
    disabled?: boolean;
  } = $props();
</script>

<Input
  search
  bind:value
  {placeholder}
  {ariaLabel}
  {oninput}
  {autofocus}
  {disabled}
  onclear={() => onClear?.()}
  trailing={busy ? spinner : undefined}
>
  {#snippet icon()}
    {@html ICONS.SEARCH}
  {/snippet}
</Input>

{#snippet spinner()}
  <span class="spinner" role="status" aria-label="Searching"></span>
{/snippet}

