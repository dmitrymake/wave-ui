<script>
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let items = [];
  export let itemHeight = 60;
  export let component;
  export let componentProps = {};

  let height = "100%";
  let scrollTop = 0;
  let viewportHeight = 0;
  let container;

  $: totalHeight = items.length * itemHeight;
  $: startIndex = Math.floor(scrollTop / itemHeight);
  $: endIndex = Math.min(
    items.length,
    startIndex + Math.ceil(viewportHeight / itemHeight) + 4,
  );
  $: visibleItems = items.slice(startIndex, endIndex).map((data, i) => ({
    index: startIndex + i,
    data,
  }));
  $: paddingTop = startIndex * itemHeight;

  function handleScroll(e) {
    scrollTop = e.target.scrollTop;
  }
</script>

<div
  class="virtual-scroll-container"
  bind:this={container}
  bind:clientHeight={viewportHeight}
  on:scroll={handleScroll}
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
        on:play={() => dispatch("play", { track: item.data })}
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
