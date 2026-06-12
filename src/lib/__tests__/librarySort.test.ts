// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";
import { sortItems } from "../librarySort";
import type { LibraryItem } from "../types";

let seq = 0;
const mk = (over: Partial<LibraryItem>): LibraryItem => ({
  displayName: "",
  thumbFile: null,
  year: "",
  _uid: `item-${seq++}`,
  ...over,
});

describe("sortItems", () => {
  it("returns empty for empty input", () => {
    expect(sortItems([], "name")).toEqual([]);
  });

  it("sorts by name case-insensitively", () => {
    const items = [
      mk({ displayName: "Charlie" }),
      mk({ displayName: "alpha" }),
      mk({ displayName: "Bravo" }),
    ];
    expect(sortItems(items, "name").map((i) => i.displayName)).toEqual([
      "alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("sorts by year ascending and descending", () => {
    const items = [
      mk({ year: "2020" }),
      mk({ year: "2000" }),
      mk({ year: "2010" }),
    ];
    expect(sortItems(items, "year").map((i) => i.year)).toEqual([
      "2000",
      "2010",
      "2020",
    ]);
    expect(sortItems(items, "year_desc").map((i) => i.year)).toEqual([
      "2020",
      "2010",
      "2000",
    ]);
  });

  it("inserts artist group headers", () => {
    const items = [
      mk({ displayName: "Album A", artist: "Beatles", year: "1965" }),
      mk({ displayName: "Album B", artist: "ABBA", year: "1976" }),
    ];
    const res = sortItems(items, "artist");
    expect(res[0].isHeader).toBe(true);
    expect(res[0].title).toBe("ABBA");
    expect(res[1].displayName).toBe("Album B");
    expect(res[2].isHeader).toBe(true);
    expect(res[2].title).toBe("Beatles");
    expect(res[3].displayName).toBe("Album A");
  });
});
