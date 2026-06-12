// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi } from "vitest";

vi.mock("../constants", () => ({
  API_ENDPOINTS: {
    RADIO_LOGOS: (filename: string) => `/imagesw/radio-logos/thumbs/${encodeURIComponent(filename)}`,
    COVER_ART: (path: string) => `/coverart.php/${encodeURI(path)}`,
  },
}));

import { getStationImageUrl } from "../radio.js";

describe("getStationImageUrl", () => {
  it("returns null for null/undefined station", () => {
    expect(getStationImageUrl(null as any)).toBeNull();
    expect(getStationImageUrl(undefined as any)).toBeNull();
  });

  it("returns null if station has no image", () => {
    expect(getStationImageUrl({ name: "Test" } as any)).toBeNull();
  });

  it("returns http URL directly", () => {
    const station = { name: "Radio", image: "http://example.com/logo.png" };
    expect(getStationImageUrl(station)).toBe("http://example.com/logo.png");
  });

  it("builds URL for local image", () => {
    const station = { name: "Jazz FM", image: "local" };
    const url = getStationImageUrl(station);
    expect(url).toBe("/imagesw/radio-logos/thumbs/Jazz%20FM.jpg");
  });

  it("builds URL for custom image filename", () => {
    const station = { name: "Radio", image: "custom_logo.png" };
    const url = getStationImageUrl(station);
    expect(url).toBe("/imagesw/radio-logos/thumbs/custom_logo.png");
  });
});
