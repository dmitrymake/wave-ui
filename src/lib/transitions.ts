// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { crossfade } from "svelte/transition";
import { cubicOut } from "svelte/easing";

/**
 * Shared hero transition for the now-playing artwork. The SAME instance is imported
 * by MiniPlayer and FullPlayer so their `send`/`receive` pair up: the cover physically
 * flies and scales between the mini-player thumbnail and the full-player artwork
 * (Apple Music container-transform). Matched by key "np-art".
 */
export const [sendArt, receiveArt] = crossfade({
  duration: 440,
  easing: cubicOut,
  // If a counterpart is missing (e.g. the docked player on first load), just fade.
  fallback(_node) {
    return { duration: 260, easing: cubicOut, css: (t: number) => `opacity: ${t}` };
  },
});

/**
 * Drives a CSS custom property (default `--t-op`) from 0→1 on intro / 1→0 on outro.
 * Lets an element fade via transition WITHOUT clobbering an inline `opacity`/transform
 * it already uses for drag feedback — compose them with `calc()` in CSS.
 */
export function fadeVar(
  _node: Element,
  { duration = 300, prop = "--t-op" }: { duration?: number; prop?: string } = {},
) {
  return { duration, easing: cubicOut, css: (t: number) => `${prop}: ${t}` };
}

/**
 * Visually-neutral transition that simply keeps a node mounted for `duration` so its
 * descendants' outros (artwork send, backdrop fade) can finish before removal.
 */
export function hold(_node: Element, { duration = 440 }: { duration?: number } = {}) {
  return { duration, css: () => "" };
}
