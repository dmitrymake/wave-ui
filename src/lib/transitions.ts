// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { crossfade } from "svelte/transition";
import { cubicOut } from "svelte/easing";

/**
 * Motion tokens for Svelte's JS transitions (fade / fly / scale / crossfade),
 * which cannot read CSS custom properties. The values mirror --dur-* in
 * src/styles/tokens.css — change both together.
 *
 * Every getter returns 0 while the user asks for reduced motion, so a transition
 * written with these tokens honours `prefers-reduced-motion` with no code of its
 * own (a Svelte transition ignores the CSS media query entirely — before this,
 * every menu, toast and sheet animated regardless of the setting). The query is
 * read at call time, so flipping the OS setting applies to the next transition.
 */
const reducedMotion =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

const ms = (value: number): number => (reducedMotion?.matches ? 0 : value);

export const MOTION = {
  /** 100ms — --dur-instant: an exit, press feedback. */
  get instant(): number {
    return ms(100);
  },
  /** 200ms — --dur-fast: a popover or dialog entering, a fade. */
  get fast(): number {
    return ms(200);
  },
  /** 300ms — --dur-base: a sheet, the drawer, a toast. */
  get base(): number {
    return ms(300);
  },
  /** 400ms — --dur-slow: the now-playing artwork's flight. */
  get slow(): number {
    return ms(400);
  },
} as const;

/**
 * The JS stand-in for --ease-emphasized (cubic-bezier(0.2, 0.8, 0.2, 1)): a
 * decelerating curve, fast out of the gate and settling gently. Svelte plays it
 * backwards for an outro, so an element leaves on the mirrored curve.
 */
export const EASE_EMPHASIZED = cubicOut;

/**
 * Shared hero transition for the now-playing artwork. The SAME instance is imported
 * by MiniPlayer and FullPlayer so their `send`/`receive` pair up: the cover physically
 * flies and scales between the mini-player thumbnail and the full-player artwork
 * (Apple Music container-transform). Matched by key "np-art".
 */
export const [sendArt, receiveArt] = crossfade({
  duration: () => MOTION.slow,
  easing: EASE_EMPHASIZED,
  // If a counterpart is missing (e.g. the docked player on first load), just fade.
  fallback(_node) {
    return { duration: MOTION.base, easing: EASE_EMPHASIZED, css: (t: number) => `opacity: ${t}` };
  },
});

/**
 * Drives a CSS custom property (default `--t-op`) from 0→1 on intro / 1→0 on outro.
 * Lets an element fade via transition WITHOUT clobbering an inline `opacity`/transform
 * it already uses for drag feedback — compose them with `calc()` in CSS.
 */
export function fadeVar(
  _node: Element,
  { duration = MOTION.base, prop = "--t-op" }: { duration?: number; prop?: string } = {},
) {
  return { duration, easing: EASE_EMPHASIZED, css: (t: number) => `${prop}: ${t}` };
}

/**
 * Visually-neutral transition that simply keeps a node mounted for `duration` so its
 * descendants' outros (artwork send, backdrop fade) can finish before removal.
 */
export function hold(_node: Element, { duration = MOTION.slow }: { duration?: number } = {}) {
  return { duration, css: () => "" };
}
