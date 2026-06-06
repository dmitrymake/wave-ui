// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
export function longpress(node: HTMLElement, duration = 2000): { destroy(): void } {
  let timer: ReturnType<typeof setTimeout>;

  // Interactive descendants that drive their own press/drag gestures
  // (volume slider, progress bar, buttons, links, form fields). A long-press
  // must NOT start when the gesture begins on one of these, otherwise the
  // sliders in the mini-player would trigger the dock's context menu.
  const INTERACTIVE = '[role="slider"], button, a, input, textarea, select';

  const startsOnInteractive = (target: EventTarget | null): boolean => {
    // Walk up to (but not including) `node`: the node itself may legitimately
    // be a role="button" (e.g. track rows, playlist cards) and must stay
    // long-pressable.
    let el = target as HTMLElement | null;
    while (el && el !== node) {
      if (el.matches?.(INTERACTIVE)) return true;
      el = el.parentElement;
    }
    return false;
  };

  const handleStart = (e: MouseEvent | TouchEvent): void => {
    if (e.type === "mousedown" && (e as MouseEvent).button !== 0) return;
    if (startsOnInteractive(e.target)) return;

    timer = setTimeout(() => {
      node.dispatchEvent(
        new CustomEvent("longpress", {
          detail: { originalEvent: e },
        }),
      );
    }, duration);
  };

  const handleEnd = (): void => {
    clearTimeout(timer);
  };

  node.addEventListener("mousedown", handleStart);
  node.addEventListener("touchstart", handleStart, { passive: true });

  node.addEventListener("mouseup", handleEnd);
  node.addEventListener("mouseleave", handleEnd);
  node.addEventListener("touchend", handleEnd);
  node.addEventListener("touchcancel", handleEnd);
  node.addEventListener("touchmove", handleEnd);

  return {
    destroy() {
      node.removeEventListener("mousedown", handleStart);
      node.removeEventListener("touchstart", handleStart);
      node.removeEventListener("mouseup", handleEnd);
      node.removeEventListener("mouseleave", handleEnd);
      node.removeEventListener("touchend", handleEnd);
      node.removeEventListener("touchcancel", handleEnd);
      node.removeEventListener("touchmove", handleEnd);
    },
  };
}
