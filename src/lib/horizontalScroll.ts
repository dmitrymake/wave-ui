// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
/** Translate vertical wheel movement into horizontal scrolling of a row. */
export function horizontalWheelScroll(
  e: WheelEvent & { currentTarget: HTMLElement },
): void {
  if (e.deltaY !== 0) {
    e.currentTarget.scrollLeft += e.deltaY;
  }
}
