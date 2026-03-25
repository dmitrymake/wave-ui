import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  navigationStack,
  navigateTo,
  consumeRouteData,
  navigateBack,
  handleBrowserBack,
  saveScrollPosition,
  getScrollPosition,
  scrollPositions,
} from "../../stores/library.js";

beforeEach(() => {
  navigationStack.set([{ view: "root" }]);
  scrollPositions.set({});
});

describe("navigateTo", () => {
  it("pushes a new view onto the stack", () => {
    navigateTo("artists");
    const stack = get(navigationStack);
    expect(stack).toHaveLength(2);
    expect(stack[1].view).toBe("artists");
  });

  it("stores route data", () => {
    navigateTo("album-detail", { albumName: "Test Album" });
    const data = consumeRouteData();
    expect(data).toEqual({ albumName: "Test Album" });
  });
});

describe("consumeRouteData", () => {
  it("returns null when no pending data", () => {
    expect(consumeRouteData()).toBeNull();
  });

  it("returns data only once", () => {
    navigateTo("test", { key: "value" });
    expect(consumeRouteData()).toEqual({ key: "value" });
    expect(consumeRouteData()).toBeNull();
  });
});

describe("navigateBack", () => {
  it("pops the last view from stack", () => {
    navigateTo("artists");
    navigateTo("album-detail");
    expect(get(navigationStack)).toHaveLength(3);

    navigateBack();
    expect(get(navigationStack)).toHaveLength(2);
    expect(get(navigationStack)[1].view).toBe("artists");
  });

  it("does not pop below root (calls window.history.back)", () => {
    // Stack has only root
    const originalBack = window.history.back;
    let called = false;
    window.history.back = () => { called = true; };

    navigateBack();
    expect(get(navigationStack)).toHaveLength(1);
    expect(called).toBe(true);

    window.history.back = originalBack;
  });
});

describe("handleBrowserBack", () => {
  it("pops the last view", () => {
    navigateTo("artists");
    handleBrowserBack();
    expect(get(navigationStack)).toHaveLength(1);
  });

  it("does nothing when only root remains", () => {
    handleBrowserBack();
    expect(get(navigationStack)).toHaveLength(1);
  });
});

describe("scroll position helpers", () => {
  it("saves and retrieves scroll position", () => {
    saveScrollPosition("artists", 250);
    expect(getScrollPosition("artists")).toBe(250);
  });

  it("returns 0 for unknown key", () => {
    expect(getScrollPosition("nonexistent")).toBe(0);
  });

  it("overwrites previous position", () => {
    saveScrollPosition("list", 100);
    saveScrollPosition("list", 500);
    expect(getScrollPosition("list")).toBe(500);
  });
});
