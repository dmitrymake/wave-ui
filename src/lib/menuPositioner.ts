import type { MenuPositionConfig } from "./types";

/**
 * Calculate the position style string for a context menu.
 */
export function calculateMenuPosition({
  isOpen,
  triggerRect,
  x,
  y,
  menuWidth,
  menuHeight,
  innerWidth,
  innerHeight,
  isMiniPlayerSource,
}: MenuPositionConfig): string {
  if (!isOpen) return "";

  const rect = triggerRect;
  const clickX = x;
  const clickY = y;

  const mw = menuWidth || 220;
  const mh = menuHeight || 320;

  if (innerWidth <= 768 && isMiniPlayerSource && rect) {
    const bottomPos = innerHeight - rect.top;
    return `
      position: fixed;
      bottom: ${bottomPos}px;
      left: 50%;
      transform: translateX(-50%);
      margin: 0;
      transform-origin: bottom center;
    `;
  }

  let left = 0;
  let top = 0;
  let transformOrigin = "top left";

  if (rect) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const isRightHalf = centerX > innerWidth / 2;
    const isBottomHalf = centerY > innerHeight / 2;

    if (isRightHalf) {
      left = rect.right - mw;
      transformOrigin = isBottomHalf ? "bottom right" : "top right";
    } else {
      left = rect.left;
      transformOrigin = isBottomHalf ? "bottom left" : "top left";
    }

    if (isBottomHalf) {
      top = rect.top - mh;
    } else {
      top = rect.bottom;
    }
  } else {
    left = clickX;
    top = clickY;
    if (left + mw > innerWidth) left = innerWidth - mw - 10;
    if (top + mh > innerHeight) top = innerHeight - mh - 10;
  }

  const padding = 8;
  if (left < padding) left = padding;
  if (left + mw > innerWidth - padding) left = innerWidth - mw - padding;
  if (top < padding) top = padding;
  if (top + mh > innerHeight - padding) top = innerHeight - mh - padding;

  return `position: fixed; top: ${top}px; left: ${left}px; margin: 0; transform-origin: ${transformOrigin};`;
}
