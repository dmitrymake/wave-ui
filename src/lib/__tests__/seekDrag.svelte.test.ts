// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushSync } from "svelte";

// getPct is pure pointer->fraction math (tested elsewhere); here we drive it
// directly so the controller's begin/move/commit + window-listener wiring is the
// only thing under test. Each call pops the next queued value.
const pctQueue: number[] = [];
const getPctMock = vi.fn((_e: MouseEvent | TouchEvent, _el: HTMLElement) => pctQueue.shift() ?? 0);
vi.mock("../playerHelpers", () => ({
  getPct: (e: MouseEvent | TouchEvent, el: HTMLElement) => getPctMock(e, el),
}));

import { createSeekController } from "../seekDrag.svelte";

// A SeekController reads $state/$derived, so it must live inside a reactive root for
// the derived `fraction`/`displaySeconds` to recompute. Each test builds one via a
// small harness that also exposes a teardown to dispose the root.
interface Harness {
  ctl: ReturnType<typeof createSeekController>;
  duration: { value: number };
  elapsed: { value: number };
  isRadio: { value: boolean };
  element: HTMLElement | undefined;
  seekTo: ReturnType<typeof vi.fn>;
  dispose: () => void;
}

function makeHarness(opts?: { windowMouse?: boolean; noElement?: boolean }): Harness {
  const duration = { value: 100 };
  const elapsed = { value: 25 };
  const isRadio = { value: false };
  const element = opts?.noElement ? undefined : document.createElement("div");
  const seekTo = vi.fn();

  let ctl!: ReturnType<typeof createSeekController>;
  const dispose = $effect.root(() => {
    ctl = createSeekController({
      getElement: () => element,
      getDuration: () => duration.value,
      getElapsed: () => elapsed.value,
      getIsRadio: () => isRadio.value,
      seekTo,
      windowMouse: opts?.windowMouse,
    });
  });

  return { ctl, duration, elapsed, isRadio, element, seekTo, dispose };
}

const mouse = (x = 0) => new MouseEvent("mousedown", { clientX: x });

beforeEach(() => {
  pctQueue.length = 0;
  getPctMock.mockClear();
});

describe("createSeekController — non-dragging display", () => {
  let h: Harness;
  afterEach(() => h?.dispose());

  it("reports playback fraction (elapsed/duration) and elapsed seconds when idle", () => {
    h = makeHarness();
    flushSync();
    expect(h.ctl.isDragging).toBe(false);
    expect(h.ctl.fraction).toBeCloseTo(0.25); // 25 / 100
    expect(h.ctl.displaySeconds).toBe(25);
  });

  it("pins the fraction to 0 for radio streams (no seekable position)", () => {
    h = makeHarness();
    h.isRadio.value = true;
    flushSync();
    expect(h.ctl.fraction).toBe(0);
  });
});

describe("createSeekController — drag lifecycle (element-bound / FullPlayer)", () => {
  let h: Harness;
  afterEach(() => h?.dispose());

  it("starts a drag on pointer-down and previews the pointer fraction", () => {
    h = makeHarness();
    pctQueue.push(0.4);
    h.ctl.onMouseDown(mouse());
    flushSync();

    expect(h.ctl.isDragging).toBe(true);
    expect(h.ctl.dragProgress).toBe(0.4);
    // While dragging, fraction follows the drag preview, not playback.
    expect(h.ctl.fraction).toBe(0.4);
    expect(h.ctl.displaySeconds).toBe(40); // 0.4 * duration(100)
  });

  it("tracks the pointer on move while dragging", () => {
    h = makeHarness();
    pctQueue.push(0.4, 0.7);
    h.ctl.onMouseDown(mouse());
    h.ctl.onMouseMove(mouse());
    flushSync();
    expect(h.ctl.dragProgress).toBe(0.7);
    expect(h.ctl.fraction).toBe(0.7);
  });

  it("commits seekTo(fraction*duration) and ends the drag on pointer-up", () => {
    h = makeHarness();
    pctQueue.push(0.6);
    h.ctl.onMouseDown(mouse());
    h.ctl.onMouseUp();
    flushSync();

    expect(h.seekTo).toHaveBeenCalledTimes(1);
    expect(h.seekTo).toHaveBeenCalledWith(60); // 0.6 * 100
    expect(h.ctl.isDragging).toBe(false);
    // After release, display falls back to live playback (elapsed=25).
    expect(h.ctl.displaySeconds).toBe(25);
  });

  it("ignores move when no drag is in progress", () => {
    h = makeHarness();
    h.ctl.onMouseMove(mouse());
    flushSync();
    expect(getPctMock).not.toHaveBeenCalled();
    expect(h.ctl.isDragging).toBe(false);
  });

  it("does not start a drag (or commit) for radio streams", () => {
    h = makeHarness();
    h.isRadio.value = true;
    flushSync();
    h.ctl.onMouseDown(mouse());
    flushSync();
    expect(h.ctl.isDragging).toBe(false);
    expect(getPctMock).not.toHaveBeenCalled();

    h.ctl.onMouseUp();
    expect(h.seekTo).not.toHaveBeenCalled();
  });

  it("does not start a drag when the bar element is missing", () => {
    h = makeHarness({ noElement: true });
    h.ctl.onMouseDown(mouse());
    flushSync();
    expect(h.ctl.isDragging).toBe(false);
    expect(h.seekTo).not.toHaveBeenCalled();
  });

  it("commits the touch position on touch-end", () => {
    h = makeHarness();
    const touchStart = new TouchEvent("touchstart");
    const touchMove = new TouchEvent("touchmove");
    pctQueue.push(0.2, 0.9);
    h.ctl.onTouchStart(touchStart);
    h.ctl.onTouchMove(touchMove);
    flushSync();
    expect(h.ctl.dragProgress).toBe(0.9);

    h.ctl.onTouchEnd();
    expect(h.seekTo).toHaveBeenCalledWith(90); // 0.9 * 100
    expect(h.ctl.isDragging).toBe(false);
  });
});

describe("createSeekController — window-strategy mouse (MiniPlayer)", () => {
  let h: Harness;
  const addSpy = vi.spyOn(window, "addEventListener");
  const removeSpy = vi.spyOn(window, "removeEventListener");

  beforeEach(() => {
    addSpy.mockClear();
    removeSpy.mockClear();
  });
  afterEach(() => h?.dispose());

  it("attaches window mousemove/mouseup listeners when a drag starts", () => {
    h = makeHarness({ windowMouse: true });
    pctQueue.push(0.3);
    h.ctl.onMouseDown(mouse());
    flushSync();

    expect(h.ctl.isDragging).toBe(true);
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("mousemove");
    expect(events).toContain("mouseup");
  });

  it("follows the cursor via the window mousemove and commits on the window mouseup", () => {
    h = makeHarness({ windowMouse: true });
    pctQueue.push(0.3, 0.85);
    h.ctl.onMouseDown(mouse());

    // The handler the controller registered on window must drive move/commit, since
    // the element-level onMouseMove/onMouseUp are inert in window mode.
    const winMove = addSpy.mock.calls.find((c) => c[0] === "mousemove")?.[1] as EventListener;
    const winUp = addSpy.mock.calls.find((c) => c[0] === "mouseup")?.[1] as EventListener;

    winMove(new MouseEvent("mousemove"));
    flushSync();
    expect(h.ctl.dragProgress).toBe(0.85);

    winUp(new MouseEvent("mouseup"));
    flushSync();
    expect(h.seekTo).toHaveBeenCalledWith(85); // 0.85 * 100
    expect(h.ctl.isDragging).toBe(false);
    // The window mouseup tears its own listeners down.
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("mousemove");
    expect(removed).toContain("mouseup");
  });

  it("element-level onMouseMove/onMouseUp are no-ops in window mode", () => {
    h = makeHarness({ windowMouse: true });
    pctQueue.push(0.3, 0.99);
    h.ctl.onMouseDown(mouse());
    const callsAfterDown = getPctMock.mock.calls.length;

    h.ctl.onMouseMove(mouse()); // inert
    h.ctl.onMouseUp(); // inert
    flushSync();

    expect(getPctMock.mock.calls.length).toBe(callsAfterDown); // no extra getPct
    expect(h.seekTo).not.toHaveBeenCalled(); // no commit from element handlers
    expect(h.ctl.isDragging).toBe(true);
  });

  it("does NOT attach window listeners when the drag bails out (radio)", () => {
    h = makeHarness({ windowMouse: true });
    h.isRadio.value = true;
    flushSync();
    h.ctl.onMouseDown(mouse());
    flushSync();
    expect(h.ctl.isDragging).toBe(false);
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).not.toContain("mousemove");
  });

  it("destroy() removes any outstanding window listeners", () => {
    h = makeHarness({ windowMouse: true });
    pctQueue.push(0.3);
    h.ctl.onMouseDown(mouse());
    removeSpy.mockClear();

    h.ctl.destroy();
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("mousemove");
    expect(removed).toContain("mouseup");
  });
});
