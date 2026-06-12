// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake

// This file is a module (the `import type` below), so global ambient declarations
// must live inside `declare global`.
import type {} from "svelte/elements";

declare global {
  // Injected at build time by Vite `define` — see vite.config.js.
  const __APP_VERSION__: string;
  const __BUILD_DATE__: string;
}

// The `longpress` action (src/lib/actions.ts) dispatches a custom DOM event, so
// `onlongpress` is a valid handler attribute on any element that uses it.
declare module "svelte/elements" {
  interface HTMLAttributes<T> {
    onlongpress?: (event: CustomEvent<{ originalEvent: Event }>) => void;
  }
}
