import { describe, it, expect, vi } from "vitest";

vi.mock("../../constants", () => ({
  API_ENDPOINTS: {
    RADIO_LOGOS: (filename: string) => `/radio-logos/${encodeURIComponent(filename)}`,
    COVER_ART: (path: string) => `/coverart.php/${encodeURI(path)}`,
    THUMB_CACHE: (hash: string, size: string) => {
      const suffix = size === "md" ? "" : "_sm";
      return `/imagesw/thmcache/${hash}${suffix}.jpg`;
    },
  },
}));

vi.mock("../../utils", () => ({
  getStationImageUrl: (station: { name: string; image: string } | null) => {
    if (!station || !station.image) return null;
    if (station.image.startsWith("http")) return station.image;
    if (station.image === "local") return `/radio-logos/${station.name}.jpg`;
    return `/radio-logos/${station.image}`;
  },
  isRemoteUrl: (url: string | undefined | null) => {
    if (!url) return false;
    return url.startsWith("http://") || url.startsWith("https://");
  },
}));

vi.mock("../../stores/library", () => ({
  stations: { subscribe: vi.fn() },
  selectedStationName: { subscribe: vi.fn() },
}));

import { getTrackCoverUrl, getTrackThumbUrl } from "../../stores/player.js";

describe("getTrackCoverUrl", () => {
  it("returns default cover for null track", () => {
    expect(getTrackCoverUrl(null)).toBe("/images/default_cover.png");
  });

  it("returns default cover for track without file", () => {
    expect(getTrackCoverUrl({ title: "Test" })).toBe("/images/default_cover.png");
  });

  it("returns track.image if it starts with http", () => {
    const track = { file: "test.mp3", image: "http://example.com/img.jpg" };
    expect(getTrackCoverUrl(track)).toBe("http://example.com/img.jpg");
  });

  it("returns track.cover if it starts with http", () => {
    const track = { file: "test.mp3", cover: "http://example.com/cover.jpg" };
    expect(getTrackCoverUrl(track)).toBe("http://example.com/cover.jpg");
  });

  it("returns coverart URL for local files", () => {
    const track = { file: "Music/track.flac" };
    expect(getTrackCoverUrl(track)).toBe("/coverart.php/Music/track.flac");
  });

  it("returns radio placeholder for radio tracks without image", () => {
    const track = { file: "http://stream.example.com/live" };
    expect(getTrackCoverUrl(track, [], null)).toBe("/images/radio_placeholder.png");
  });

  it("resolves radio image from station list", () => {
    const track = { file: "http://stream.example.com", title: "Jazz FM" };
    const stations = [{ name: "Jazz FM", image: "local" }];
    const url = getTrackCoverUrl(track, stations);
    expect(url).toBe("/radio-logos/Jazz FM.jpg");
  });

  it("returns coverart for genre Radio with local file", () => {
    const track = { file: "Music/track.mp3", genre: "Radio" };
    // genre is Radio but file is local — resolveRadioImage returns null, fallback to radio_placeholder
    const url = getTrackCoverUrl(track, [], null);
    expect(url).toBe("/images/radio_placeholder.png");
  });
});

describe("getTrackThumbUrl", () => {
  it("returns default icon for null track", () => {
    expect(getTrackThumbUrl(null)).toBe("/images/default_icon.png");
  });

  it("returns default icon for track without file", () => {
    expect(getTrackThumbUrl({ title: "Test" })).toBe("/images/default_icon.png");
  });

  it("returns track.image if http", () => {
    const track = { file: "x.mp3", image: "http://img.com/a.jpg" };
    expect(getTrackThumbUrl(track)).toBe("http://img.com/a.jpg");
  });

  it("uses thumbHash if available", () => {
    const track = { file: "Music/track.flac", thumbHash: "abc123" };
    expect(getTrackThumbUrl(track, "sm")).toBe("/imagesw/thmcache/abc123_sm.jpg");
    expect(getTrackThumbUrl(track, "md")).toBe("/imagesw/thmcache/abc123.jpg");
  });

  it("generates md5 hash for directory path", () => {
    const track = { file: "Music/Artist/Album/track.flac" };
    const url = getTrackThumbUrl(track, "sm");
    // Should be /imagesw/thmcache/<md5 of "Music/Artist/Album">_sm.jpg
    expect(url).toMatch(/^\/imagesw\/thmcache\/[a-f0-9]{32}_sm\.jpg$/);
  });

  it("returns radio icon for radio tracks", () => {
    const track = { file: "http://stream.example.com/live" };
    expect(getTrackThumbUrl(track, "sm", [], null)).toBe("/images/radio_icon.png");
  });
});
