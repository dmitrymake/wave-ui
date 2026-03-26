<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import type { Component } from "svelte";
  import type { Track } from "../lib/types";

  interface Props {
    items?: Track[];
    itemHeight?: number;
    component: Component<Record<string, unknown>>;
    componentProps?: Record<string, unknown>;
    onPlay?: (data: { track: Track }) => void;
  }

  let { items = [], itemHeight = 60, component, componentProps = {}, onPlay }: Props = $props();

  let height = "100%";
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let container: HTMLDivElement;

  let totalHeight = $derived(items.length * itemHeight);
  let startIndex = $derived(Math.floor(scrollTop / itemHeight));
  let endIndex = $derived(Math.min(
    items.length,
    startIndex + Math.ceil(viewportHeight / itemHeight) + 4,
  ));
  let visibleItems = $derived(items.slice(startIndex, endIndex).map((data, i) => ({
    index: startIndex + i,
    data,
  })));
  let paddingTop = $derived(startIndex * itemHeight);

  function handleScroll(e: Event) {
    scrollTop = (e.target as HTMLElement).scrollTop;
  }
</script>

<div
  class="virtual-scroll-container"
  bind:this={container}
  bind:clientHeight={viewportHeight}
  onscroll={handleScroll}
  style="height: {height};"
>
  <div
    class="virtual-scroll-content"
    style="height: {totalHeight}px; padding-top: {paddingTop}px; box-sizing: border-box;"
  >
    {#each visibleItems as item (item.index)}
      <svelte:component
        this={component}
        track={item.data}
        index={item.index}
        {...componentProps}
        onplay={() => onPlay?.({ track: item.data })}
      />
    {/each}
  </div>
</div>

<style>
  .virtual-scroll-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    position: relative;
    scrollbar-width: thin;
    scrollbar-color: var(--c-white-20) transparent;
  }
  .virtual-scroll-container::-webkit-scrollbar {
    width: 6px;
  }
  .virtual-scroll-container::-webkit-scrollbar-thumb {
    background-color: var(--c-white-20);
    border-radius: 3px;
  }
  .virtual-scroll-content {
    width: 100%;
  }
</style>
