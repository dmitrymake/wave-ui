<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<!--
  Presentational search bar for the Yandex view. The debounce + monotonic-seq
  search controller stays in the parent (YandexView): it owns viewMode, navigation
  and the result stores, so it passes the bound `value`, the raw `oninput` handler
  (which runs the debounce) and an `onClear` callback here. This component only
  renders the input chrome and the conditional clear button, so behaviour is
  unchanged — the parent still drives every state transition.

  `value` is $bindable so two-way binding matches the original `bind:value`:
  the parent sets it programmatically (e.g. cleared on mode change) and the input
  reflects user typing back up immediately.
-->
<script lang="ts">
  import { ICONS } from "../../../lib/icons";

  let {
    value = $bindable(""),
    oninput,
    onClear,
  }: {
    value?: string;
    oninput?: (e: Event) => void;
    onClear?: () => void;
  } = $props();
</script>

<div class="content-padded no-bottom-pad">
  <div class="search-input-container">
    <span class="search-icon">{@html ICONS.SEARCH}</span>
    <input
      type="text"
      placeholder="Search Yandex Music..."
      bind:value
      {oninput}
    />
    {#if value}
      <button class="clear-btn" onclick={() => onClear?.()}>
        {@html ICONS.CLOSE}
      </button>
    {/if}
  </div>
</div>

<style>
  .search-input-container {
    display: flex;
    align-items: center;
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
    gap: 10px;
  }
  input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    outline: none;
    font-size: 15px;
  }
  .search-icon,
  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--c-text-muted);
    width: 20px;
    height: 20px;
  }
  .clear-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
</style>
