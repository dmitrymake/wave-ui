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

  Chrome is the shared Input primitive in `search` mode (leading magnifier +
  trailing clear). Compact `sm` size keeps the original list-search geometry
  (radius-md 8px, pad 8px/12px, font 15px, icon 20px). The primitive's clear sets
  value="" (propagated via bind) and calls `onclear`; the parent's onClear then
  also runs its history.back(), so the original clear flow is preserved.
-->
<script lang="ts">
  import { ICONS } from "../../../lib/icons";
  import Input from "../../ui/Input.svelte";

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
  <div class="search-margin">
    <Input
      search
      size="sm"
      bind:value
      placeholder="Search Yandex Music..."
      ariaLabel="Search Yandex Music"
      {oninput}
      onclear={() => onClear?.()}
    >
      {#snippet icon()}
        {@html ICONS.SEARCH}
      {/snippet}
    </Input>
  </div>
</div>

<style>
  .search-margin {
    margin-bottom: var(--space-3); /* legacy .search-input-container */
  }
</style>
