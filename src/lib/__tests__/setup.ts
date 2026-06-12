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

// `globals: true` makes the svelteTesting() plugin skip its own auto-cleanup, so
// unmount rendered components after every test to keep the jsdom tree isolated.
afterEach(() => {
  cleanup();
});
