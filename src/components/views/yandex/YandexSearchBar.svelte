<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<!--
  Presentational search bar for the Yandex view. Renders the shared SearchBar
  (the same canonical 48px control as library Search), so both bars stay one
  component. The debounce + monotonic-seq search controller stays in the parent
  (YandexView): it owns viewMode, navigation and the result stores, so it passes
  the bound `value`, the raw `oninput` handler (which runs the debounce) and an
  `onClear` callback here.

  `value` is $bindable so two-way binding matches the original `bind:value`:
  the parent sets it programmatically (e.g. cleared on mode change) and the input
  reflects user typing back up immediately.
-->
<script lang="ts">
  import SearchBar from "../../ui/SearchBar.svelte";

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
  <div class="search-block">
    <SearchBar
      bind:value
      placeholder="Search Yandex Music..."
      ariaLabel="Search Yandex Music"
      {oninput}
      {onClear}
    />
  </div>
</div>

<style>
</style>
