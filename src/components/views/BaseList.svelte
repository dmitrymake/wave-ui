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

  // Event callback for item reordering (fromIndex, toIndex)
  export let onMoveItem = (from, to) => {};

  // --- SCROLL RESTORATION LOGIC ---
  let scrollKey = "";
  let savedScrollTop = 0;
  let isRestored = false;

  // Формируем уникальный ключ для текущего экрана (например "albums_by_artist_Pink Floyd")
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

  // 1. При монтировании пытаемся получить позицию
  onMount(async () => {
    savedScrollTop = getScrollPosition(scrollKey);
    // Пробуем восстановить сразу, если данные уже есть
    if (!isLoading && savedScrollTop > 0 && dragEngine.refs.scrollContainer) {
      await tick();
      dragEngine.refs.scrollContainer.scrollTop = savedScrollTop;
      isRestored = true;
    }
  });

  // 2. Если данные загрузились позже, восстанавливаем после isLoading = false
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

  // 3. Сохраняем позицию при уничтожении компонента (переход на другой view)
  onDestroy(() => {
    dragEngine.cancelDrag();
    if (dragEngine.refs.scrollContainer) {
      saveScrollPosition(scrollKey, dragEngine.refs.scrollContainer.scrollTop);
    }
  });

  // --- DRAG AND DROP LOGIC ---
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
        {#each Array(6) as _}
          <div style="padding: 10px 0;">
            <Skeleton width="100%" height="50px" />
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
    {/if}
  </div>
</div>

<style>
  @import "./MusicViews.css";

  .skeletons-wrapper {
    padding: 0 32px;
  }
  @media (max-width: 768px) {
    .skeletons-wrapper {
      padding: 0 16px;
    }
  }
</style>
