// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("constants", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("API_ENDPOINTS.COVER_ART builds correct URL", async () => {
    vi.doMock("../../config", () => ({
      CONFIG: { MOODE_IP: "192.168.1.100" },
    }));

    // In test env (jsdom), import.meta.env.DEV is false, port is not 3000
    // so getBaseUrl returns ""
    const { API_ENDPOINTS } = await import("../constants.js");
    const url = API_ENDPOINTS.COVER_ART("Music/Artist/Album/track.flac");
    expect(url).toContain("/coverart.php/");
    expect(url).toContain("Music/Artist/Album/track.flac");
  });

  it("API_ENDPOINTS.COVER_ART strips leading slash", async () => {
    vi.doMock("../../config", () => ({
      CONFIG: { MOODE_IP: "192.168.1.100" },
    }));

    const { API_ENDPOINTS } = await import("../constants.js");
    const url = API_ENDPOINTS.COVER_ART("/Music/track.flac");
    expect(url).not.toContain("//Music");
  });

  it("API_ENDPOINTS.THUMB_CACHE builds correct URL", async () => {
    vi.doMock("../../config", () => ({
      CONFIG: { MOODE_IP: "192.168.1.100" },
    }));

    const { API_ENDPOINTS } = await import("../constants.js");
    expect(API_ENDPOINTS.THUMB_CACHE("abc123", "sm")).toContain("abc123_sm.jpg");
    expect(API_ENDPOINTS.THUMB_CACHE("abc123", "md")).toContain("abc123.jpg");
    expect(API_ENDPOINTS.THUMB_CACHE("abc123", "md")).not.toContain("_sm");
  });

  it("API_ENDPOINTS.RADIO_LOGOS encodes filename", async () => {
    vi.doMock("../../config", () => ({
      CONFIG: { MOODE_IP: "192.168.1.100" },
    }));

    const { API_ENDPOINTS } = await import("../constants.js");
    const url = API_ENDPOINTS.RADIO_LOGOS("Jazz FM.jpg");
    expect(url).toContain("Jazz%20FM.jpg");
  });

  it("DATABASE constants are correct", async () => {
    vi.doMock("../../config", () => ({
      CONFIG: { MOODE_IP: "localhost" },
    }));

    const { DATABASE } = await import("../constants.js");
    expect(DATABASE.NAME).toBe("MoodePlayerDB");
    expect(DATABASE.STORE_NAME).toBe("music");
    expect(DATABASE.VERSION).toBe(3);
  });
});
