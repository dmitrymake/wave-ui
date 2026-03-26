// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

// Mock theme module before importing ui store
vi.mock("../../theme", () => ({
  THEMES: [
    {
      id: "default",
      label: "Default",
      colors: { "--c-accent": "#fa2d48" },
    },
  ],
}));

import {
  toastMessage,
  showToast,
  modal,
  showModal,
  closeModal,
  contextMenu,
  openContextMenu,
  closeContextMenu,
  playlistSelector,
  openPlaylistSelector,
  closePlaylistSelector,
} from "../../stores/ui.js";
import type { Track } from "../../types";

// Cast partial test data
const asTrack = (obj: Partial<Track>) => obj as Track;
const asEvent = (obj: Record<string, unknown>) => obj as any;

describe("showToast / toastMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets toast message", () => {
    showToast("Hello", "info");
    expect(get(toastMessage)).toEqual({ text: "Hello", type: "info" });
  });

  it("clears toast after 3 seconds", () => {
    showToast("Temporary", "success");
    expect(get(toastMessage)).not.toBeNull();

    vi.advanceTimersByTime(3000);
    expect(get(toastMessage)).toBeNull();
  });

  it("resets timer on consecutive calls", () => {
    showToast("First", "info");
    vi.advanceTimersByTime(2000);
    showToast("Second", "error");

    vi.advanceTimersByTime(2000);
    // Second toast should still be visible (only 2s since it was set)
    expect(get(toastMessage)).toEqual({ text: "Second", type: "error" });

    vi.advanceTimersByTime(1000);
    expect(get(toastMessage)).toBeNull();
  });

  it("defaults to info type", () => {
    showToast("Default type");
    expect(get(toastMessage)!.type).toBe("info");
  });
});

describe("showModal / closeModal", () => {
  it("opens modal with params", () => {
    showModal({
      title: "Delete?",
      message: "Are you sure?",
      type: "confirm",
    });
    const m = get(modal);
    expect(m.isOpen).toBe(true);
    expect(m.title).toBe("Delete?");
    expect(m.message).toBe("Are you sure?");
    expect(m.type).toBe("confirm");
  });

  it("uses default values", () => {
    showModal({});
    const m = get(modal);
    expect(m.title).toBe("Confirm Action");
    expect(m.message).toBe("Are you sure?");
    expect(m.confirmLabel).toBe("Confirm");
    expect(m.cancelLabel).toBe("Cancel");
  });

  it("closes modal", () => {
    showModal({ title: "Test" });
    expect(get(modal).isOpen).toBe(true);

    closeModal();
    expect(get(modal).isOpen).toBe(false);
    expect(get(modal).title).toBe("");
  });
});

describe("contextMenu", () => {
  beforeEach(() => {
    closeContextMenu();
  });

  it("opens context menu with track and coordinates", () => {
    const track = { file: "test.mp3", title: "Test" };
    const fakeEvent = {
      currentTarget: {
        getBoundingClientRect: () => ({ top: 100, left: 50, width: 200, height: 40 }),
      },
      clientX: 150,
      clientY: 200,
    };

    openContextMenu(asEvent(fakeEvent), asTrack(track), { type: "queue", index: 3 });
    const cm = get(contextMenu);
    expect(cm.isOpen).toBe(true);
    expect(cm.track).toEqual(track);
    expect(cm.x).toBe(150);
    expect(cm.y).toBe(200);
    expect(cm.context.type).toBe("queue");
    expect(cm.context.index).toBe(3);
  });

  it("does not open without track (unless playlist-card)", () => {
    // Reset context menu to closed state first
    closeContextMenu();
    const fakeEvent = { currentTarget: null, clientX: 0, clientY: 0 };
    openContextMenu(asEvent(fakeEvent), null);
    // Guard only checks: !track && contextData.type !== "playlist-card"
    // Default contextData is {}, type is undefined, so it should not open
    // But if previous test left it open, we need to verify fresh state
    expect(get(contextMenu).isOpen).toBe(false);
  });

  it("opens for playlist-card type without track", () => {
    const fakeEvent = {
      currentTarget: null,
      target: { closest: () => null },
      clientX: 100,
      clientY: 200,
    };
    openContextMenu(asEvent(fakeEvent), null, { type: "playlist-card" });
    expect(get(contextMenu).isOpen).toBe(true);
  });

  it("closes context menu", () => {
    closeContextMenu();
    const cm = get(contextMenu);
    expect(cm.isOpen).toBe(false);
    expect(cm.track).toBeNull();
  });

  it("handles touch events", () => {
    const track = { file: "test.mp3" };
    const fakeEvent = {
      currentTarget: {
        getBoundingClientRect: () => ({ top: 0, left: 0 }),
      },
      touches: [{ clientX: 50, clientY: 80 }],
    };
    openContextMenu(asEvent(fakeEvent), asTrack(track));
    const cm = get(contextMenu);
    expect(cm.x).toBe(50);
    expect(cm.y).toBe(80);
  });
});

describe("playlistSelector", () => {
  it("opens and closes playlist selector", () => {
    const track = asTrack({ file: "test.mp3" });
    openPlaylistSelector(track);
    const ps = get(playlistSelector);
    expect(ps.isOpen).toBe(true);
    expect(ps.track).toEqual(track);

    closePlaylistSelector();
    const closed = get(playlistSelector);
    expect(closed.isOpen).toBe(false);
    expect(closed.track).toBeNull();
  });

  it("closes context menu when opening playlist selector", () => {
    // First open context menu
    const track = asTrack({ file: "test.mp3" });
    const fakeEvent = {
      currentTarget: { getBoundingClientRect: () => ({}) },
      clientX: 0,
      clientY: 0,
    };
    openContextMenu(asEvent(fakeEvent), track);
    expect(get(contextMenu).isOpen).toBe(true);

    // Then open playlist selector — context menu should close
    openPlaylistSelector(track);
    expect(get(contextMenu).isOpen).toBe(false);
    expect(get(playlistSelector).isOpen).toBe(true);
  });
});
