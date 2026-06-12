// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
//
// Shared seek-bar drag engine for the player progress bars. Both FullPlayer and
// MiniPlayer drive a near-identical "drag the bar, optimistically preview the
// position, commit to MPD on release" gesture; this factory owns that state and
// the pointer handlers so the components stay markup-only.
//
// Runes (`$state`/`$derived`) require the `.svelte.ts` extension to run outside
// a component.
import { getPct } from "./playerHelpers";

export interface SeekControllerOptions {
  /** Live progress-bar element the gesture is measured against. */
  getElement: () => HTMLElement | undefined;
  /** Track duration in seconds (already guarded to a non-zero value). */
  getDuration: () => number;
  /** Current playback position in seconds (used while not dragging). */
  getElapsed: () => number;
  /** Radio streams have no seekable position; the gesture is a no-op for them. */
  getIsRadio: () => boolean;
  /** Commit the chosen position (seconds) to MPD. */
  seekTo: (seconds: number) => void;
  /**
   * MiniPlayer tracks its mouse drag on `window` so it keeps following the
   * cursor outside the thin dock bar; FullPlayer binds mouse on the element like
   * touch. Touch handling is identical for both regardless of this flag.
   */
  windowMouse?: boolean;
}

export interface SeekController {
  /** True while the user is actively dragging the bar. */
  readonly isDragging: boolean;
  /** Optimistic drag position as a 0..1 fraction of the duration. */
  readonly dragProgress: number;
  /** 0..1 fraction to render: drag preview while dragging, else playback. */
  readonly fraction: number;
  /** Elapsed seconds to display: drag preview while dragging, else playback. */
  readonly displaySeconds: number;
  /** Pointer-down (mouse) on the bar. */
  onMouseDown: (e: MouseEvent) => void;
  /** Pointer-down (touch) on the bar. */
  onTouchStart: (e: TouchEvent) => void;
  /** Touch move while dragging. */
  onTouchMove: (e: TouchEvent) => void;
  /** Touch end — commits the position. */
  onTouchEnd: () => void;
  /**
   * Element-level mouse move/up for the non-window strategy (FullPlayer). For
   * the window strategy these are wired internally and these handlers are
   * no-ops so the markup can attach them uniformly.
   */
  onMouseMove: (e: MouseEvent) => void;
  onMouseUp: () => void;
  /** Tear down any outstanding window listeners (call from onDestroy). */
  destroy: () => void;
}

export function createSeekController(options: SeekControllerOptions): SeekController {
  let isDragging = $state(false);
  let dragProgress = $state(0);

  // While dragging, preview the drag position; otherwise reflect playback.
  // Radio has no seekable position, so it pins to zero.
  const fraction = $derived(
    options.getIsRadio()
      ? 0
      : isDragging
        ? dragProgress
        : options.getElapsed() / options.getDuration(),
  );
  const displaySeconds = $derived(
    isDragging ? dragProgress * options.getDuration() : options.getElapsed(),
  );

  function begin(e: MouseEvent | TouchEvent): void {
    if (options.getIsRadio()) return;
    const el = options.getElement();
    if (!el) return;
    isDragging = true;
    dragProgress = getPct(e, el);
  }

  function move(e: MouseEvent | TouchEvent): void {
    if (!isDragging) return;
    const el = options.getElement();
    if (el) dragProgress = getPct(e, el);
  }

  function commit(): void {
    if (isDragging && !options.getIsRadio()) {
      options.seekTo(dragProgress * options.getDuration());
    }
    isDragging = false;
  }

  // --- Window-strategy mouse handlers (MiniPlayer) ---
  function onWinMove(e: MouseEvent): void {
    move(e);
  }
  function onWinUp(): void {
    commit();
    window.removeEventListener("mousemove", onWinMove);
    window.removeEventListener("mouseup", onWinUp);
  }

  function onMouseDown(e: MouseEvent): void {
    if (options.windowMouse) {
      begin(e);
      // Only attach the window drag if the gesture actually started (radio /
      // missing element bail out of `begin`).
      if (isDragging) {
        window.addEventListener("mousemove", onWinMove);
        window.addEventListener("mouseup", onWinUp);
      }
      return;
    }
    begin(e);
  }

  function onMouseMove(e: MouseEvent): void {
    // The window strategy handles its own move/up; element handlers are inert.
    if (options.windowMouse) return;
    move(e);
  }

  function onMouseUp(): void {
    if (options.windowMouse) return;
    commit();
  }

  return {
    get isDragging() {
      return isDragging;
    },
    get dragProgress() {
      return dragProgress;
    },
    get fraction() {
      return fraction;
    },
    get displaySeconds() {
      return displaySeconds;
    },
    onMouseDown,
    onTouchStart: begin,
    onTouchMove: move,
    onTouchEnd: commit,
    onMouseMove,
    onMouseUp,
    destroy() {
      window.removeEventListener("mousemove", onWinMove);
      window.removeEventListener("mouseup", onWinUp);
    },
  };
}
