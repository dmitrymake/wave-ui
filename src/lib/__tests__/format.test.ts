// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";
import { countLabel, bitrateLabel, NBSP, ELLIPSIS } from "../format";

describe("countLabel", () => {
  it("agrees the noun with the count and binds them with a no-break space", () => {
    expect(countLabel(1, "track")).toBe(`1${NBSP}track`);
    expect(countLabel(2, "track")).toBe(`2${NBSP}tracks`);
    expect(countLabel(0, "album")).toBe(`0${NBSP}albums`);
  });

  it("takes an irregular plural", () => {
    expect(countLabel(3, "match", "matches")).toBe(`3${NBSP}matches`);
  });
});

describe("bitrateLabel", () => {
  it("binds the unit to the number", () => {
    expect(bitrateLabel(320)).toBe(`320${NBSP}kbps`);
  });
  it("is empty for a missing or zero rate", () => {
    expect(bitrateLabel(0)).toBe("");
    expect(bitrateLabel(undefined)).toBe("");
    expect(bitrateLabel(null)).toBe("");
  });
});

describe("characters", () => {
  it("are the real ones", () => {
    expect(NBSP).toBe(" ");
    expect(ELLIPSIS).toBe("…");
  });
});
