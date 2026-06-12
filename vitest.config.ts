// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import path from "path";

// The component tests render real `.svelte` files, so the Svelte compiler and the
// testing-library helper (browser resolve conditions + DOM noExternal) are wired in
// here. Auto-cleanup is handled explicitly in setup.ts because `globals: true` makes
// `svelteTesting` skip its own cleanup wiring.
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/lib/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      $lib: path.resolve("src/lib"),
    },
  },
});
