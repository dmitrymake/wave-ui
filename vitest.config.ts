// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
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
