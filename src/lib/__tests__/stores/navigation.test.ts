// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";

import {
  navigationStack,
  resetNavigation,
  setNavigationStack,
  pushNavigationEntry,
} from "../../stores/navigation.js";
import type { NavigationEntry } from "../../types";

describe("navigationStack single-writer invariant", () => {
  beforeEach(() => {
    // Sanctioned reset keeps each test deterministic.
    resetNavigation();
  });

  it("exposes no mutation methods (external code cannot mutate it)", () => {
    // Only { subscribe } is exposed; .set/.update are intentionally absent so any
    // stray external writer becomes a compile error.
    expect(typeof (navigationStack as any).set).toBe("undefined");
    expect(typeof (navigationStack as any).update).toBe("undefined");
    expect(typeof navigationStack.subscribe).toBe("function");
  });

  it("resetNavigation() leaves the stack at exactly [{ view: 'root' }]", () => {
    // Pollute the stack first to prove reset replaces it wholesale.
    setNavigationStack([{ view: "root" }, { view: "albums", data: { id: 1 } }]);
    resetNavigation();

    let snapshot: NavigationEntry[] | undefined;
    const unsub = navigationStack.subscribe((v) => {
      snapshot = v;
    });
    unsub();

    expect(snapshot).toEqual([{ view: "root" }]);
    expect(get(navigationStack)).toEqual([{ view: "root" }]);
  });

  it("setNavigationStack([...]) replaces the whole stack with the given entries", () => {
    const entries = [
      { view: "root" },
      { view: "artist", data: { name: "X" } },
      { view: "album", data: { id: "42" } },
    ];
    setNavigationStack(entries);

    expect(get(navigationStack)).toEqual(entries);
  });

  it("pushNavigationEntry('v', { x: 1 }) appends without dropping prior entries", () => {
    const base = [
      { view: "root" },
      { view: "artist", data: { name: "X" } },
    ];
    setNavigationStack(base);

    pushNavigationEntry("v", { x: 1 });

    expect(get(navigationStack)).toEqual([
      { view: "root" },
      { view: "artist", data: { name: "X" } },
      { view: "v", data: { x: 1 } },
    ]);
  });

  it("pushNavigationEntry defaults data to null when omitted", () => {
    pushNavigationEntry("solo");

    const stack = get(navigationStack);
    expect(stack[stack.length - 1]).toEqual({ view: "solo", data: null });
  });
});
