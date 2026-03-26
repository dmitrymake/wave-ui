// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi } from "vitest";
import { writable, get } from "svelte/store";
import type { Track } from "../types";
import { createPlaylistDrag } from "../playlistDrag.js";

function createDrag() {
  const tracksStore = writable([
    { file: "a.mp3", _uid: "1" },
    { file: "b.mp3", _uid: "2" },
    { file: "c.mp3", _uid: "3" },
    { file: "d.mp3", _uid: "4" },
    { file: "e.mp3", _uid: "5" },
  ] as Track[]);

  const onMoveTrack = vi.fn();
  const drag = createPlaylistDrag({ tracksStore, onMoveTrack });
  return { drag, tracksStore, onMoveTrack };
}

describe("createPlaylistDrag", () => {
  it("returns expected API", () => {
    const { drag } = createDrag();
    expect(drag).toHaveProperty("isDragging");
    expect(drag).toHaveProperty("isDropping");
    expect(drag).toHaveProperty("isReordering");
    expect(drag).toHaveProperty("draggingIndex");
    expect(drag).toHaveProperty("hoverIndex");
    expect(drag).toHaveProperty("ghostCoords");
    expect(drag).toHaveProperty("onDragInit");
    expect(drag).toHaveProperty("onPointerMove");
    expect(drag).toHaveProperty("onPointerUp");
    expect(drag).toHaveProperty("getRowStyle");
    expect(drag).toHaveProperty("cancelDrag");
  });

  it("initializes with default state", () => {
    const { drag } = createDrag();
    expect(get(drag.isDragging)).toBe(false);
    expect(get(drag.isDropping)).toBe(false);
    expect(get(drag.isReordering)).toBe(false);
    expect(get(drag.draggingIndex)).toBeNull();
    expect(get(drag.hoverIndex)).toBeNull();
  });
});

describe("getRowStyle", () => {
  it("returns empty string when not dragging", () => {
    const { drag } = createDrag();
    expect(drag.getRowStyle(0, false, false, null, null, false)).toBe("");
  });

  it("returns empty string when reordering", () => {
    const { drag } = createDrag();
    expect(drag.getRowStyle(0, true, false, 1, 3, true)).toBe("");
  });

  it("hides dragged item", () => {
    const { drag } = createDrag();
    const style = drag.getRowStyle(2, true, false, 2, 4, false);
    expect(style).toContain("opacity: 0");
    expect(style).toContain("pointer-events: none");
  });

  it("shifts items up when dragging down", () => {
    const { drag } = createDrag();
    // Dragging from index 1 to hover at index 3
    // Items at 2, 3 should shift up (-100%)
    expect(drag.getRowStyle(2, true, false, 1, 3, false)).toContain("translateY(-100%)");
    expect(drag.getRowStyle(3, true, false, 1, 3, false)).toContain("translateY(-100%)");
    // Item at 0 should not move
    expect(drag.getRowStyle(0, true, false, 1, 3, false)).toBe("");
    // Item at 4 should not move
    expect(drag.getRowStyle(4, true, false, 1, 3, false)).toBe("");
  });

  it("shifts items down when dragging up", () => {
    const { drag } = createDrag();
    // Dragging from index 3 to hover at index 1
    // Items at 1, 2 should shift down (+100%)
    expect(drag.getRowStyle(1, true, false, 3, 1, false)).toContain("translateY(100%)");
    expect(drag.getRowStyle(2, true, false, 3, 1, false)).toContain("translateY(100%)");
    // Item at 0 should not move
    expect(drag.getRowStyle(0, true, false, 3, 1, false)).toBe("");
    // Item at 4 should not move
    expect(drag.getRowStyle(4, true, false, 3, 1, false)).toBe("");
  });

  it("returns empty when drag and hover at same index", () => {
    const { drag } = createDrag();
    expect(drag.getRowStyle(0, true, false, 2, 2, false)).toBe("");
  });
});

describe("cancelDrag", () => {
  it("resets drag state", () => {
    const { drag } = createDrag();
    drag.cancelDrag();
    expect(get(drag.isDragging)).toBe(false);
    expect(get(drag.isDropping)).toBe(false);
    expect(get(drag.draggingIndex)).toBeNull();
    expect(get(drag.hoverIndex)).toBeNull();
    expect(get(drag.draggedItemData)).toBeNull();
  });
});
