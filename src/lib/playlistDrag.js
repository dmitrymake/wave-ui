import { writable, get } from "svelte/store";
import { tick } from "svelte";

const SCROLL_ZONE_PX = 100;
const SCROLL_SPEED_BASE = 5;
const SCROLL_SPEED_MAX = 25;
const DRAG_THRESHOLD = 3;

export function createPlaylistDrag({ tracksStore, onMoveTrack }) {
  const isDragging = writable(false);
  const isDropping = writable(false);
  const isReordering = writable(false);

  const draggingIndex = writable(null);
  const hoverIndex = writable(null);
  const justDroppedIndex = writable(null);

  const ghostCoords = writable({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    grabOffsetX: 0,
    grabOffsetY: 0,
  });
  const draggedItemData = writable(null);

  let isDown = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  const refs = {
    scrollContainer: null,
    listBodyContainer: null,
  };

  let scrollInterval = null;

  function onDragInit(event, index, track) {
    const e = event.detail;
    if (e.button === 2) return;
    if (window.getSelection) window.getSelection().removeAllRanges();

    if (!refs.scrollContainer) return;

    const rows = refs.scrollContainer.querySelectorAll(".row-wrapper");
    const targetRow = rows[index];
    if (!targetRow) return;

    const rect = targetRow.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const grabOffsetX = clientX - rect.left;
    const grabOffsetY = clientY - rect.top;

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

  function onPointerMove(e) {
    if (!isDown || get(isDropping)) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (!get(isDragging)) {
      const dx = Math.abs(clientX - startX);
      const dy = Math.abs(clientY - startY);
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

  function calculateHoverIndex() {
    if (!refs.listBodyContainer) return;

    const listRect = refs.listBodyContainer.getBoundingClientRect();
    const gCoords = get(ghostCoords);

    const mouseRelativeY = currentY - listRect.top;
    const ghostCenterInList =
      mouseRelativeY - gCoords.grabOffsetY + gCoords.height / 2;

    const tracksCount = get(tracksStore).length;

    if (ghostCenterInList < 0) {
      hoverIndex.set(0);
      return;
    }
    if (ghostCenterInList > listRect.height) {
      hoverIndex.set(tracksCount);
      return;
    }

    const rows = Array.from(
      refs.listBodyContainer.querySelectorAll(".row-wrapper"),
    );
    let bestIndex = -1;
    let minDistance = Infinity;

    // Мы должны учитывать расстояние до оригинального слота, чтобы можно было вернуть трек назад.
    rows.forEach((row, idx) => {
      const rowCenterY = row.offsetTop + row.offsetHeight / 2;
      const dist = Math.abs(ghostCenterInList - rowCenterY);

      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = idx;
      }
    });

    if (bestIndex !== -1) {
      hoverIndex.set(bestIndex);
    }
  }

  function onPointerUp(e) {
    if (!isDown) return;
    isDown = false;

    if (!get(isDragging)) {
      cancelDrag();
      return;
    }
    commitDrop();
  }

  async function commitDrop() {
    stopAutoScroll();

    // 1. Фаза полета
    isDragging.set(false);
    isDropping.set(true);

    const finalHoverIndex = get(hoverIndex);
    const gCoords = get(ghostCoords);

    // Расчет координат для анимации полета (без изменений)
    if (refs.listBodyContainer && finalHoverIndex !== null) {
      const rows = refs.listBodyContainer.querySelectorAll(".row-wrapper");
      const targetRow = rows[finalHoverIndex];
      if (targetRow) {
        const listRect = refs.listBodyContainer.getBoundingClientRect();
        const targetTopScreen = listRect.top + targetRow.offsetTop;
        const targetLeftScreen = listRect.left + targetRow.offsetLeft;
        ghostCoords.update((c) => ({
          ...c,
          y: targetTopScreen + c.grabOffsetY,
          x: targetLeftScreen + c.grabOffsetX,
        }));
      }
    }

    // Ждем анимацию полета
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Блокируем анимации
    isReordering.set(true);

    // Ждем, пока Svelte добавит класс в DOM
    await tick();

    // Без этого на мобилке класс применяется слишком поздно.
    if (refs.listBodyContainer) {
      const _forceReflow = refs.listBodyContainer.offsetHeight;
    }

    // Теперь, когда анимации гарантированно выключены, меняем всё разом.
    const currentDragIdx = get(draggingIndex);
    const maxIndex = get(tracksStore).length;
    let validIndex = Math.max(0, Math.min(finalHoverIndex, maxIndex));
    let insertAt = validIndex;

    if (currentDragIdx !== null && currentDragIdx !== validIndex) {
      const tracks = [...get(tracksStore)];
      const [item] = tracks.splice(currentDragIdx, 1);

      insertAt = Math.max(0, Math.min(insertAt, tracks.length));
      tracks.splice(insertAt, 0, item);

      // Обновляем массив
      tracksStore.set(tracks);

      if (onMoveTrack) {
        onMoveTrack(currentDragIdx, insertAt);
      }
    }

    // Мгновенно сбрасываем индексы.
    draggingIndex.set(null);
    hoverIndex.set(null);
    draggedItemData.set(null);
    isDropping.set(false);

    // Включаем анимацию приземления для нового элемента
    const droppedAt = currentDragIdx !== validIndex ? insertAt : currentDragIdx;
    justDroppedIndex.set(droppedAt);

    // Ждем отрисовки нового состояния DOM
    await tick();

    // Возвращаем анимации обратно
    requestAnimationFrame(() => {
      isReordering.set(false);
      setTimeout(() => {
        justDroppedIndex.set(null);
      }, 300);
    });
  }
  function cancelDrag() {
    isDown = false;
    resetDragState();
  }

  function resetDragState() {
    isDragging.set(false);
    isDropping.set(false);
    draggingIndex.set(null);
    hoverIndex.set(null);
    draggedItemData.set(null);
    stopAutoScroll();
  }

  function handleAutoScroll(y) {
    if (!refs.scrollContainer) return;
    const { top, bottom } = refs.scrollContainer.getBoundingClientRect();
    const distTop = y - top;
    const distBottom = bottom - y;

    stopAutoScroll();
    let speed = 0;

    if (distTop < SCROLL_ZONE_PX && distTop > 0) {
      const intensity = 1 - distTop / SCROLL_ZONE_PX;
      speed = -(SCROLL_SPEED_BASE + SCROLL_SPEED_MAX * (intensity * intensity));
    } else if (distBottom < SCROLL_ZONE_PX && distBottom > 0) {
      const intensity = 1 - distBottom / SCROLL_ZONE_PX;
      speed = SCROLL_SPEED_BASE + SCROLL_SPEED_MAX * (intensity * intensity);
    }

    if (speed !== 0) startAutoScroll(speed);
  }

  function startAutoScroll(speed) {
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

  function stopAutoScroll() {
    if (scrollInterval) {
      cancelAnimationFrame(scrollInterval);
      scrollInterval = null;
    }
  }

  function getRowStyle(
    index,
    isDraggingVal,
    isDroppingVal,
    dragIdxVal,
    hoverIdxVal,
    isReorderingVal,
  ) {
    // Пусть DOM элементы встанут на свои новые места чисто.
    if (isReorderingVal) return "";

    if (
      (!isDraggingVal && !isDroppingVal) ||
      dragIdxVal === null ||
      hoverIdxVal === null
    )
      return "";

    // Скрытие элемента под пальцем
    if (index === dragIdxVal) {
      return "opacity: 0; pointer-events: none;";
    }

    if (dragIdxVal === hoverIdxVal) return "";

    // Сдвиги
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
