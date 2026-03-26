import { describe, it, expect, vi } from "vitest";

vi.mock("../constants", () => ({
  API_ENDPOINTS: {
    RADIO_LOGOS: (filename: string) => `/imagesw/radio-logos/thumbs/${encodeURIComponent(filename)}`,
    COVER_ART: (path: string) => `/coverart.php/${encodeURI(path)}`,
  },
}));

import { getStationImageUrl, getCoverUrl, generateUid } from "../utils.js";

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

describe("getCoverUrl", () => {
  it("returns null for null/undefined song", () => {
    expect(getCoverUrl(null as any)).toBeNull();
    expect(getCoverUrl(undefined as any)).toBeNull();
  });

  it("returns null if song has no file", () => {
    expect(getCoverUrl({ title: "Test" } as any)).toBeNull();
  });

  it("returns cover URL for local file", () => {
    const song = { file: "Music/Artist/Album/track.flac" };
    expect(getCoverUrl(song)).toBe("/coverart.php/Music/Artist/Album/track.flac");
  });

  it("returns null for http streams", () => {
    const song = { file: "http://stream.example.com/live" };
    expect(getCoverUrl(song)).toBeNull();
  });
});

describe("generateUid", () => {
  it("returns a non-empty string", () => {
    const uid = generateUid();
    expect(typeof uid).toBe("string");
    expect(uid.length).toBeGreaterThan(0);
  });

  it("generates unique values", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateUid());
    }
    expect(ids.size).toBe(100);
  });
});
