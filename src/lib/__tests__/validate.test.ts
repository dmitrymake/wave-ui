// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";
import { normalizeStreamMeta, normalizeStation, isRawTrackData } from "../validate.js";

describe("normalizeStreamMeta", () => {
  it("accepts valid meta with coerced types", () => {
    expect(
      normalizeStreamMeta("u", { id: 1, title: "T", artist: "A", album: "Al", image: "i", time: "200" }),
    ).toEqual({ id: "1", title: "T", artist: "A", album: "Al", image: "i", time: 200 });
  });
  it("rejects non-objects and empty title+artist", () => {
    expect(normalizeStreamMeta("u", null)).toBeNull();
    expect(normalizeStreamMeta("u", { album: 123, time: "x" })).toBeNull();
  });
  it("drops wrong-typed time instead of poisoning the queue (numbers coerce)", () => {
    expect(normalizeStreamMeta("u", { title: "T", artist: "A", album: 123, time: "x" })).toEqual({
      id: "",
      title: "T",
      artist: "A",
      album: "123",
      image: undefined,
      time: undefined,
    });
  });
});

describe("normalizeStation", () => {
  it("accepts valid rows", () => {
    expect(
      normalizeStation({ id: 1, name: "Jazz", station: "http://x", logo: "l", genre: "Jazz" }),
    ).toEqual({ id: 1, name: "Jazz", file: "http://x", station: "http://x", image: "l", genre: "Jazz" });
  });
  it("rejects rows without name/station and non-objects", () => {
    expect(normalizeStation({ id: 1, name: "", station: "" })).toBeNull();
    expect(normalizeStation(null)).toBeNull();
    expect(normalizeStation({ name: "x" })).toBeNull();
  });
});

describe("isRawTrackData", () => {
  it("requires an object with a string file", () => {
    expect(isRawTrackData({ file: "a.mp3" })).toBe(true);
    expect(isRawTrackData(null)).toBe(false);
    expect(isRawTrackData(42)).toBe(false);
    expect(isRawTrackData({ title: "no file" })).toBe(false);
  });
});
