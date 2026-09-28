// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import "fake-indexeddb/auto";
// jest-dom matchers (toBeInTheDocument, toHaveClass, ...) for the component tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/svelte";
import { afterEach } from "vitest";

// jsdom does not implement the Web Animations API, but Svelte's built-in
// transitions (fly/fade/etc., used by FullPlayer and other transport components)
// call element.animate() on mount/unmount. Provide a minimal stub that satisfies
// the Animation interface Svelte touches (cancel + an immediately-firing onfinish)
// so transitions resolve synchronously instead of throwing "animate is not a
// function". Only installed when missing, so a future jsdom that ships WAAPI wins.
if (typeof Element !== "undefined" && typeof Element.prototype.animate !== "function") {
  Element.prototype.animate = function animate(): Animation {
    // Minimal Animation-shaped stub. Typed loosely (the full Animation interface is
    // large and unused here) then cast once for the return value.
    const anim: {
      onfinish: ((this: Animation, ev: Event) => unknown) | null;
      oncancel: ((this: Animation, ev: Event) => unknown) | null;
      cancel: () => void;
      play: () => void;
      pause: () => void;
      finished: Promise<Animation>;
    } = {
      onfinish: null,
      oncancel: null,
      cancel() {},
      play() {},
      pause() {},
      finished: Promise.resolve() as unknown as Promise<Animation>,
    };
    // Svelte assigns onfinish after calling animate(); fire it on the next tick so
    // the assignment lands first, letting the transition complete cleanly.
    queueMicrotask(() => anim.onfinish?.call(anim as unknown as Animation, new Event("finish")));
    return anim as unknown as Animation;
  };
}

// jsdom here exposes `window` but not `localStorage` (`typeof localStorage ===
// "undefined"`), while the settings stores read and write it on import. The
// stores guard every access with try/catch, the tests could not — so install a
// minimal in-memory Storage in the shared setup instead of patching each store.
if (typeof globalThis.localStorage === "undefined") {
  const items = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
  for (const target of [globalThis, typeof window !== "undefined" ? window : null]) {
    if (!target) continue;
    Object.defineProperty(target, "localStorage", {
      value: stub,
      configurable: true,
      writable: true,
    });
  }
}

// `globals: true` makes the svelteTesting() plugin skip its own auto-cleanup, so
// unmount rendered components after every test to keep the jsdom tree isolated.
afterEach(() => {
  cleanup();
});
