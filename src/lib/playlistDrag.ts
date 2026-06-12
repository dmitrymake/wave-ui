// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable, get } from "svelte/store";
import type { Writable } from "svelte/store";
import { tick } from "svelte";

const SCROLL_ZONE_PX: number = 100;
const SCROLL_SPEED_BASE: number = 5;
const SCROLL_SPEED_MAX: number = 25;
const DRAG_THRESHOLD: number = 3;

interface GhostCoords {
  x: number;
  y: number;
  width: number;
  height: number;
  grabOffsetX: number;
  grabOffsetY: number;
}

interface DragRefs {
  scrollContainer: HTMLElement | null;
  listBodyContainer: HTMLElement | null;
}

// The engine reorders the list opaquely (splice + store.set) and never reads an
// item's fields, so it is generic over the row type T. This lets BaseList back
// stores of Track, YandexTrack or LibraryItem without an `as unknown as` cast.
interface PlaylistDragOptions<T> {
  tracksStore: Writable<T[]>;
  onMoveTrack?: (fromPos: number, toPos: number) => void;
}

interface PlaylistDragResult<T> {
  isDragging: Writable<boolean>;
  isDropping: Writable<boolean>;
  isReordering: Writable<boolean>;
  draggingIndex: Writable<number | null>;
  hoverIndex: Writable<number | null>;
  justDroppedIndex: Writable<number | null>;
  draggedItemData: Writable<T | null>;
  ghostCoords: Writable<GhostCoords>;
  refs: DragRefs;
  onDragInit: (event: MouseEvent | TouchEvent, index: number, track: T) => void;
  onPointerMove: (e: MouseEvent | TouchEvent) => void;
  onPointerUp: (e: MouseEvent | TouchEvent) => void;
  getRowStyle: (
    index: number,
    isDraggingVal: boolean,
    isDroppingVal: boolean,
    dragIdxVal: number | null,
    hoverIdxVal: number | null,
    isReorderingVal: boolean,
  ) => string;
  cancelDrag: () => void;
}

export function createPlaylistDrag<T>({ tracksStore, onMoveTrack }: PlaylistDragOptions<T>): PlaylistDragResult<T> {
  const isDragging: Writable<boolean> = writable<boolean>(false);
  const isDropping: Writable<boolean> = writable<boolean>(false);
  const isReordering: Writable<boolean> = writable<boolean>(false);

  const draggingIndex: Writable<number | null> = writable<number | null>(null);
  const hoverIndex: Writable<number | null> = writable<number | null>(null);
  const justDroppedIndex: Writable<number | null> = writable<number | null>(null);

  const ghostCoords: Writable<GhostCoords> = writable<GhostCoords>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    grabOffsetX: 0,
    grabOffsetY: 0,
  });
  const draggedItemData: Writable<T | null> = writable<T | null>(null);

  let isDown: boolean = false;
  let startX: number = 0;
  let startY: number = 0;
  let currentX: number = 0;
  let currentY: number = 0;

  const refs: DragRefs = {
    scrollContainer: null,
    listBodyContainer: null,
  };

  let scrollInterval: number | null = null;

  function onDragInit(event: MouseEvent | TouchEvent, index: number, track: T): void {
    if ('button' in event && event.button === 2) return;
    if (window.getSelection) window.getSelection()?.removeAllRanges();

    if (!refs.scrollContainer) return;

    const rows: NodeListOf<Element> = refs.scrollContainer.querySelectorAll(".row-wrapper");
    const targetRow = rows[index] as HTMLElement | undefined;
    if (!targetRow) return;

    const rect: DOMRect = targetRow.getBoundingClientRect();
    const clientX: number = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY: number = 'touches' in event ? event.touches[0].clientY : event.clientY;

    const grabOffsetX: number = clientX - rect.left;
    const grabOffsetY: number = clientY - rect.top;

    isDown = true;
    isDragging.set(false);
    isDropping.set(false);

    startX = clientX;
    startY = clientY;
    currentX = clientX;
    currentY = clientY;

    draggingIndex.set(index);
    hoverIndex.set(index);
    draggedItemData.set(track);
    justDroppedIndex.set(null);

    ghostCoords.set({
      x: clientX,
      y: clientY,
      width: rect.width,
      height: rect.height,
      grabOffsetX,
      grabOffsetY,
    });
  }

  function onPointerMove(e: MouseEvent | TouchEvent): void {
    if (!isDown || get(isDropping)) return;

    const clientX: number = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const clientY: number = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

    if (!get(isDragging)) {
      const dx: number = Math.abs(clientX - startX);
      const dy: number = Math.abs(clientY - startY);
      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
      isDragging.set(true);
    }

    if (e.cancelable) e.preventDefault();

    currentX = clientX;
    currentY = clientY;

    ghostCoords.update((c) => ({ ...c, x: currentX, y: currentY }));

    handleAutoScroll(currentY);
    calculateHoverIndex();
  }

  function calculateHoverIndex(): void {
    if (!refs.listBodyContainer) return;

    const listRect: DOMRect = refs.listBodyContainer.getBoundingClientRect();
    const gCoords: GhostCoords = get(ghostCoords);

    const mouseRelativeY: number = currentY - listRect.top;
    const ghostCenterInList: number =
      mouseRelativeY - gCoords.grabOffsetY + gCoords.height / 2;

    const tracksCount: number = get(tracksStore).length;

    if (ghostCenterInList < 0) {
      hoverIndex.set(0);
      return;
    }
    if (ghostCenterInList > listRect.height) {
      hoverIndex.set(tracksCount);
      return;
    }

    const rows: HTMLElement[] = Array.from(
      refs.listBodyContainer.querySelectorAll(".row-wrapper"),
    ) as HTMLElement[];
    let bestIndex: number = -1;
    let minDistance: number = Infinity;

    rows.forEach((row, idx) => {
      const rowCenterY: number = row.offsetTop + row.offsetHeight / 2;
      const dist: number = Math.abs(ghostCenterInList - rowCenterY);

      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = idx;
      }
    });

    if (bestIndex !== -1) {
      hoverIndex.set(bestIndex);
    }
  }

  function onPointerUp(e: MouseEvent | TouchEvent): void {
    if (!isDown) return;
    isDown = false;

    if (!get(isDragging)) {
      cancelDrag();
      return;
    }
    commitDrop();
  }

  async function commitDrop(): Promise<void> {
    stopAutoScroll();

    calculateHoverIndex();

    isDragging.set(false);
    isDropping.set(true);

    const finalHoverIndex: number | null = get(hoverIndex);

    if (refs.listBodyContainer && finalHoverIndex !== null) {
      const rows: NodeListOf<Element> = refs.listBodyContainer.querySelectorAll(".row-wrapper");
      const listRect: DOMRect = refs.listBodyContainer.getBoundingClientRect();
      const targetRow = rows[finalHoverIndex] as HTMLElement | undefined;

      let targetTop: number = 0;
      let targetLeft: number = 0;
      let shouldAnimate: boolean = false;

      if (targetRow) {
        targetTop = listRect.top + targetRow.offsetTop;
        targetLeft = listRect.left + targetRow.offsetLeft;
        shouldAnimate = true;
      } else if (finalHoverIndex >= rows.length && rows.length > 0) {
        const lastRow = rows[rows.length - 1] as HTMLElement;
        targetTop = listRect.top + lastRow.offsetTop + lastRow.offsetHeight;
        targetLeft = listRect.left + lastRow.offsetLeft;
        shouldAnimate = true;
      } else if (rows.length === 0) {
        targetTop = listRect.top;
        targetLeft = listRect.left;
        shouldAnimate = true;
      }

      if (shouldAnimate) {
        ghostCoords.update((c) => ({
          ...c,
          y: targetTop + c.grabOffsetY,
          x: targetLeft + c.grabOffsetX,
        }));
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 250));

    isReordering.set(true);
    await tick();

    const currentDragIdx: number | null = get(draggingIndex);
    const maxIndex: number = get(tracksStore).length;
    let validIndex: number = Math.max(0, Math.min(finalHoverIndex ?? 0, maxIndex));
    let insertAt: number = validIndex;

    if (currentDragIdx !== null && currentDragIdx !== validIndex) {
      const tracks: T[] = [...get(tracksStore)];
      const [item] = tracks.splice(currentDragIdx, 1);

      insertAt = Math.max(0, Math.min(insertAt, tracks.length));
      tracks.splice(insertAt, 0, item);

      tracksStore.set(tracks);

      if (onMoveTrack) {
        onMoveTrack(currentDragIdx, insertAt);
      }

      draggingIndex.set(insertAt);
    }

    await tick();

    draggedItemData.set(null);
    draggingIndex.set(null);
    hoverIndex.set(null);
    isDropping.set(false);

    const droppedAt: number = currentDragIdx !== validIndex ? insertAt : (currentDragIdx ?? 0);
    justDroppedIndex.set(droppedAt);

    await tick();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isReordering.set(false);
        setTimeout(() => {
          justDroppedIndex.set(null);
        }, 300);
      });
    });
  }

  function cancelDrag(): void {
    isDown = false;
    resetDragState();
  }

  function resetDragState(): void {
    isDragging.set(false);
    isDropping.set(false);
    draggingIndex.set(null);
    hoverIndex.set(null);
    draggedItemData.set(null);
    stopAutoScroll();
  }

  function handleAutoScroll(y: number): void {
    if (!refs.scrollContainer) return;
    const { top, bottom } = refs.scrollContainer.getBoundingClientRect();
    const distTop: number = y - top;
    const distBottom: number = bottom - y;

    stopAutoScroll();
    let speed: number = 0;

    if (distTop < SCROLL_ZONE_PX && distTop > 0) {
      const intensity: number = 1 - distTop / SCROLL_ZONE_PX;
      speed = -(SCROLL_SPEED_BASE + SCROLL_SPEED_MAX * (intensity * intensity));
    } else if (distBottom < SCROLL_ZONE_PX && distBottom > 0) {
      const intensity: number = 1 - distBottom / SCROLL_ZONE_PX;
      speed = SCROLL_SPEED_BASE + SCROLL_SPEED_MAX * (intensity * intensity);
    }

    if (speed !== 0) startAutoScroll(speed);
  }

  function startAutoScroll(speed: number): void {
    if (scrollInterval) return;
    scrollInterval = requestAnimationFrame(function tickLoop() {
      if (!refs.scrollContainer) return;
      refs.scrollContainer.scrollTop += speed;

      if (get(isDragging)) {
        const fakeEvent = {
          touches: [{ clientX: currentX, clientY: currentY }],
          clientX: currentX,
          clientY: currentY,
          preventDefault: () => {},
        };
        ghostCoords.update((c) => ({ ...c, x: currentX, y: currentY }));
        calculateHoverIndex();

        scrollInterval = requestAnimationFrame(tickLoop);
      }
    });
  }

  function stopAutoScroll(): void {
    if (scrollInterval) {
      cancelAnimationFrame(scrollInterval);
      scrollInterval = null;
    }
  }

  function getRowStyle(
    index: number,
    isDraggingVal: boolean,
    isDroppingVal: boolean,
    dragIdxVal: number | null,
    hoverIdxVal: number | null,
    isReorderingVal: boolean,
  ): string {
    if (isReorderingVal) return "";

    if (
      (!isDraggingVal && !isDroppingVal) ||
      dragIdxVal === null ||
      hoverIdxVal === null
    )
      return "";

    if (index === dragIdxVal) {
      return "opacity: 0; pointer-events: none;";
    }

    if (dragIdxVal === hoverIdxVal) return "";

    if (dragIdxVal < hoverIdxVal) {
      if (index > dragIdxVal && index <= hoverIdxVal) {
        return "transform: translateY(-100%);";
      }
    }

    if (dragIdxVal > hoverIdxVal) {
      if (index >= hoverIdxVal && index < dragIdxVal) {
        return "transform: translateY(100%);";
      }
    }
    return "";
  }

  return {
    isDragging,
    isDropping,
    isReordering,
    draggingIndex,
    hoverIndex,
    justDroppedIndex,
    draggedItemData,
    ghostCoords,
    refs,
    onDragInit,
    onPointerMove,
    onPointerUp,
    getRowStyle,
    cancelDrag,
  };
}
