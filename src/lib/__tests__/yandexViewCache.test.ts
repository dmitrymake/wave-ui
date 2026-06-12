// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";
import { ViewCache } from "../yandexViewCache";

describe("ViewCache", () => {
  it("computes stable keys from mode + data", () => {
    const c = new ViewCache<number>();
    expect(c.key("dash", null)).toBe("dash{}");
    expect(c.key("search", { q: "x" })).toBe('search{"q":"x"}');
  });

  it("stores and retrieves entries", () => {
    const c = new ViewCache<number>(3);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    expect(c.get("missing")).toBeUndefined();
  });

  it("evicts the oldest entry once maxSize is exceeded", () => {
    const c = new ViewCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3); // exceeds size 2 → evicts "a"
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });
});
