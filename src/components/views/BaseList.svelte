<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import Skeleton from "../Skeleton.svelte";
  import { createPlaylistDrag } from "../../lib/playlistDrag";

  import {
    navigationStack,
    activeMenuTab,
    saveScrollPosition,
    getScrollPosition,
  } from "../../lib/store";

  export let itemsStore;
  export let isEditMode = false;
  export let isLoading = false;
  export let emptyText = "List is empty";

  export let onMoveItem = (from, to) => {};

  let scrollKey = "";
  let savedScrollTop = 0;
  let isRestored = false;

  $: {
    const stack = $navigationStack;
    const current = stack[stack.length - 1];
    const tab = $activeMenuTab;

    if (current && current.view === "root") {
      scrollKey = `root_${tab}`;
    } else if (current) {
      const dataName = current.data
        ? current.data.name || current.data
        : "unknown";
      scrollKey = `${current.view}_${dataName}`;
    }
  }

  onMount(async () => {
    savedScrollTop = getScrollPosition(scrollKey);
    if (!isLoading && savedScrollTop > 0 && dragEngine.refs.scrollContainer) {
      await tick();
      dragEngine.refs.scrollContainer.scrollTop = savedScrollTop;
      isRestored = true;
    }
  });

  $: if (
    !isLoading &&
    !isRestored &&
    savedScrollTop > 0 &&
    dragEngine.refs.scrollContainer
  ) {
    restoreScrollAsync();
  }

  async function restoreScrollAsync() {
    await tick();
    if (dragEngine.refs.scrollContainer) {
      dragEngine.refs.scrollContainer.scrollTop = savedScrollTop;
      isRestored = true;
    }
  }

  onDestroy(() => {
    dragEngine.cancelDrag();
    if (dragEngine.refs.scrollContainer) {
      saveScrollPosition(scrollKey, dragEngine.refs.scrollContainer.scrollTop);
    }
  });

  const dragEngine = createPlaylistDrag({
    tracksStore: itemsStore,
    onMoveTrack: (fromIndex, toIndex) => {
      onMoveItem(fromIndex, toIndex);
    },
  });

  const {
    isDragging,
    isDropping,
    isReordering,
    draggingIndex,
    hoverIndex,
    justDroppedIndex,
    draggedItemData,
    ghostCoords,
    refs,
  } = dragEngine;

  function startDrag(event, index, item) {
    if (!isEditMode) return;
    dragEngine.onDragInit(event, index, item);
  }
</script>

<svelte:window
  on:mousemove={dragEngine.onPointerMove}
  on:mouseup={dragEngine.onPointerUp}
  on:touchmove|nonpassive={dragEngine.onPointerMove}
  on:touchend={dragEngine.onPointerUp}
  on:touchcancel={dragEngine.onPointerUp}
/>

<div
  class="base-list-scroll-container"
  class:dragging={$isDragging}
  bind:this={refs.scrollContainer}
>
  {#if ($isDragging || $isDropping) && $draggedItemData}
    <div
      class="floating-item"
      class:dropping={$isDropping}
      style="
            top: {$ghostCoords.y - $ghostCoords.grabOffsetY}px; 
            left: {$ghostCoords.x - $ghostCoords.grabOffsetX}px;
            width: {$ghostCoords.width}px; 
            height: {$ghostCoords.height}px;
        "
    >
      <div style="pointer-events: none; width: 100%; height: 100%;">
        <slot
          name="row"
          item={$draggedItemData}
          index={$draggingIndex}
          isGhost={true}
          startDrag={() => {}}
        />
      </div>
    </div>
  {/if}

  <div
    class="list-body"
    bind:this={refs.listBodyContainer}
    in:fade={{ duration: 200 }}
  >
    <slot name="header"></slot>

    {#if isLoading}
      <div class="skeletons-wrapper">
        {#each Array(10) as _}
          <div class="skeleton-row">
            <div class="sk-left">
              <Skeleton
                width="24px"
                height="24px"
                radius="4px"
                style="opacity: 0.3"
              />
              <Skeleton
                width="40px"
                height="40px"
                radius="4px"
                style="margin-left: 12px;"
              />
            </div>

            <div class="sk-info">
              <Skeleton
                width="40%"
                height="14px"
                radius="4px"
                style="margin-bottom: 6px;"
              />
              <Skeleton
                width="25%"
                height="12px"
                radius="4px"
                style="opacity: 0.6"
              />
            </div>

            <div class="sk-right">
              <Skeleton width="30px" height="12px" radius="4px" />
            </div>
          </div>
        {/each}
      </div>
    {:else}
      {#each $itemsStore as item, i (item._uid || i)}
        <div
          class="row-wrapper"
          class:ghost-placeholder={$draggingIndex === i &&
            ($isDragging || $isDropping)}
          class:just-dropped={$justDroppedIndex === i}
          class:no-transition={$isReordering}
          style={dragEngine.getRowStyle(
            i,
            $isDragging,
            $isDropping,
            $draggingIndex,
            $hoverIndex,
            $isReordering,
          )}
        >
          <slot
            name="row"
            {item}
            index={i}
            isGhost={false}
            startDrag={(e) => startDrag(e, i, item)}
          />
        </div>
      {/each}

      {#if $itemsStore.length === 0}
        <div class="content-padded" style="text-align: center; opacity: 0.5;">
          {emptyText}
        </div>
      {/if}

      <slot name="footer"></slot>
    {/if}
  </div>
</div>

<style>
  @import "./MusicViews.css";

  .skeletons-wrapper {
    padding: 0 16px;
  }

  .skeleton-row {
    display: flex;
    align-items: center;
    height: 64px;
    padding: 0 16px;
    border-bottom: 1px solid var(--c-border-dim);
  }

  .sk-left {
    display: flex;
    align-items: center;
    width: 80px;
    min-width: 80px;
  }

  .sk-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .sk-right {
    margin-left: auto;
  }

  .row-wrapper {
    transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
    will-change: transform;
  }

  .row-wrapper.no-transition {
    transition: none !important;
  }

  @media (max-width: 768px) {
    .skeletons-wrapper {
      padding: 0 16px;
    }
  }
</style>
