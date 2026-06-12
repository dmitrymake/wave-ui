// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

// Settings store reads localStorage on import, so we set values before importing
beforeEach(() => {
  localStorage.clear();
});

describe("settings stores", () => {
  it("alarm stores use localStorage defaults", async () => {
    // Re-import to get fresh module with cleared localStorage
    vi.resetModules();
    const { alarmTime, isAlarmEnabled, alarmPlaylist } = await import(
      "../../stores/settings.js"
    );

    expect(get(alarmTime)).toBe("08:00");
    expect(get(isAlarmEnabled)).toBe(false);
    expect(get(alarmPlaylist)).toBe("Favorites");
  });

  it("alarm stores persist to localStorage", async () => {
    vi.resetModules();
    const { alarmTime, isAlarmEnabled, alarmPlaylist } = await import(
      "../../stores/settings.js"
    );

    alarmTime.set("07:30");
    isAlarmEnabled.set(true);
    alarmPlaylist.set("Morning Mix");

    expect(localStorage.getItem("alarmTime")).toBe("07:30");
    expect(localStorage.getItem("alarmEnabled")).toBe("true");
    expect(localStorage.getItem("alarmPlaylist")).toBe("Morning Mix");
  });

  it("reads saved values from localStorage", async () => {
    localStorage.setItem("alarmTime", "22:00");
    localStorage.setItem("alarmEnabled", "true");
    localStorage.setItem("alarmPlaylist", "Night Jazz");

    vi.resetModules();
    const { alarmTime, isAlarmEnabled, alarmPlaylist } = await import(
      "../../stores/settings.js"
    );

    expect(get(alarmTime)).toBe("22:00");
    expect(get(isAlarmEnabled)).toBe(true);
    expect(get(alarmPlaylist)).toBe("Night Jazz");
  });
});
