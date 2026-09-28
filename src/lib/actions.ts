// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
/**
 * Long-press gesture shared by track rows, playlist cards and the mini-player.
 *
 * Touch notes: the browser fires a synthetic click when the finger lifts, so
 * without the capture-phase swallow below a long-press on a row would BOTH open
 * the context menu and play the track (or immediately close the menu it opened).
 * The default duration is the single value for the whole app — long enough not
 * to fire while scrolling, short enough to feel deliberate on a touchscreen.
 *
 * `enabled` exists for the shared media card, which only some callers wire a
 * context menu to: an unarmed long press would still swallow the click that
 * follows it (handleClick below), so the gesture has to be switchable rather
 * than merely unused.
 */
export function longpress(
  node: HTMLElement,
  options: { duration?: number; enabled?: boolean } = {},
): { destroy(): void } {
  const { duration = 600, enabled = true } = options;
  let timer: ReturnType<typeof setTimeout>;
  let fired = false;

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
    if (!enabled) return;
    if (e.type === "mousedown" && (e as MouseEvent).button !== 0) return;
    if (startsOnInteractive(e.target)) return;
    fired = false;

    timer = setTimeout(() => {
      fired = true;
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

  // Capture phase: runs before the row/card onclick, and only swallows the
  // click that belongs to a long press that already fired.
  const handleClick = (e: MouseEvent): void => {
    if (!fired) return;
    fired = false;
    e.stopPropagation();
    e.preventDefault();
  };

  node.addEventListener("mousedown", handleStart);
  node.addEventListener("touchstart", handleStart, { passive: true });
  node.addEventListener("click", handleClick, true);

  node.addEventListener("mouseup", handleEnd);
  node.addEventListener("mouseleave", handleEnd);
  node.addEventListener("touchend", handleEnd);
  node.addEventListener("touchcancel", handleEnd);
  node.addEventListener("touchmove", handleEnd);

  return {
    destroy() {
      node.removeEventListener("mousedown", handleStart);
      node.removeEventListener("touchstart", handleStart);
      node.removeEventListener("click", handleClick, true);
      node.removeEventListener("mouseup", handleEnd);
      node.removeEventListener("mouseleave", handleEnd);
      node.removeEventListener("touchend", handleEnd);
      node.removeEventListener("touchcancel", handleEnd);
      node.removeEventListener("touchmove", handleEnd);
    },
  };
}
