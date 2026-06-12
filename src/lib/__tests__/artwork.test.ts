// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi } from "vitest";

vi.mock("../constants", () => ({
  API_ENDPOINTS: {
    RADIO_LOGOS: (filename: string) => `/radio-logos/${encodeURIComponent(filename)}`,
    COVER_ART: (path: string) => `/coverart.php/${encodeURI(path)}`,
    THUMB_CACHE: (hash: string, size: string) => {
      const suffix = size === "md" ? "" : "_sm";
      return `/imagesw/thmcache/${hash}${suffix}.jpg`;
    },
  },
}));

vi.mock("../utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils")>();
  return {
    ...actual,
    getStationImageUrl: (station: { name: string; image: string } | null) => {
      if (!station || !station.image) return null;
      if (station.image.startsWith("http")) return station.image;
      if (station.image === "local") return `/radio-logos/${station.name}.jpg`;
      return `/radio-logos/${station.image}`;
    },
  };
});

// resolveSource decides whether a remote-looking file is owned by a streaming
// source (so NOT internet radio). Drive it explicitly to exercise both branches.
const resolveSourceMock = vi.hoisted(() => vi.fn());
vi.mock("../sources/trackSource", () => ({
  resolveSource: resolveSourceMock,
}));

import { isRadioTrack, getTrackCoverUrl, getTrackThumbUrl } from "../artwork.js";
import type { Track, Station } from "../types";

const t = (obj: Partial<Track> | null) => obj as Track;
const stationList = (s: Partial<Station>[]) => s as Station[];

describe("isRadioTrack", () => {
  it("is false for an empty file", () => {
    resolveSourceMock.mockReturnValue(undefined);
    expect(isRadioTrack("")).toBe(false);
  });

  it("is true for a remote stream URL", () => {
    resolveSourceMock.mockReturnValue(undefined);
    expect(isRadioTrack("http://stream.example.com/live")).toBe(true);
  });

  it("is true for a moOde RADIO file path", () => {
    resolveSourceMock.mockReturnValue(undefined);
    expect(isRadioTrack("RADIO/Some Station.pls")).toBe(true);
  });

  it("is false for a remote file owned by a streaming source (Yandex)", () => {
    // Streaming-source tracks look remote but are not internet radio.
    resolveSourceMock.mockReturnValue({ id: "yandex" });
    expect(isRadioTrack("yandex://track/123")).toBe(false);
  });

  it("is false for a plain local library file", () => {
    resolveSourceMock.mockReturnValue(undefined);
    expect(isRadioTrack("Music/Artist/track.flac")).toBe(false);
  });
});

describe("getTrackCoverUrl", () => {
  it("returns default cover for null track", () => {
    expect(getTrackCoverUrl(null)).toBe("/images/default_cover.png");
  });

  it("returns default cover for track without file", () => {
    resolveSourceMock.mockReturnValue(undefined);
    expect(getTrackCoverUrl(t({ title: "Test" }))).toBe("/images/default_cover.png");
  });

  it("prefers a remote track.image over everything else", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "test.mp3", image: "http://example.com/img.jpg" });
    expect(getTrackCoverUrl(track)).toBe("http://example.com/img.jpg");
  });

  it("falls back to a remote track.cover", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "test.mp3", cover: "http://example.com/cover.jpg" });
    expect(getTrackCoverUrl(track)).toBe("http://example.com/cover.jpg");
  });

  it("returns coverart URL for local files", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "Music/track.flac" });
    expect(getTrackCoverUrl(track)).toBe("/coverart.php/Music/track.flac");
  });

  it("returns radio placeholder for radio tracks without image", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "http://stream.example.com/live" });
    expect(getTrackCoverUrl(track, [], null)).toBe("/images/radio_placeholder.png");
  });

  it("resolves a radio image from the station list by title", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "http://stream.example.com", title: "Jazz FM" });
    const url = getTrackCoverUrl(track, stationList([{ name: "Jazz FM", image: "local" }]));
    expect(url).toBe("/radio-logos/Jazz FM.jpg");
  });

  it("uses an explicit non-remote station image for a radio track", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "http://stream.example.com", stationName: "KEXP", image: "kexp.png" });
    expect(getTrackCoverUrl(track)).toBe("/radio-logos/kexp.png");
  });

  it("falls back to the station-name image when no list matches", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "http://stream.example.com", stationName: "My Station" });
    expect(getTrackCoverUrl(track, [], null)).toBe("/radio-logos/My Station.jpg");
  });

  it("treats a streaming-source remote file as a normal cover, not radio", () => {
    resolveSourceMock.mockReturnValue({ id: "yandex" });
    const track = t({ file: "http://stream.example.com/song" });
    // Not radio -> not the placeholder; falls through to the coverart endpoint.
    expect(getTrackCoverUrl(track, [], null)).toBe(
      "/coverart.php/http://stream.example.com/song",
    );
  });
});

describe("getTrackThumbUrl", () => {
  it("returns default icon for null track", () => {
    expect(getTrackThumbUrl(null)).toBe("/images/default_icon.png");
  });

  it("returns default icon for track without file", () => {
    resolveSourceMock.mockReturnValue(undefined);
    expect(getTrackThumbUrl(t({ title: "Test" }))).toBe("/images/default_icon.png");
  });

  it("returns a remote track.image directly", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "x.mp3", image: "http://img.com/a.jpg" });
    expect(getTrackThumbUrl(track)).toBe("http://img.com/a.jpg");
  });

  it("uses thumbHash when available, switching by size", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "Music/track.flac", thumbHash: "abc123" });
    expect(getTrackThumbUrl(track, "sm")).toBe("/imagesw/thmcache/abc123_sm.jpg");
    expect(getTrackThumbUrl(track, "md")).toBe("/imagesw/thmcache/abc123.jpg");
  });

  it("derives an md5 thumb-cache hash from the directory path", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "Music/Artist/Album/track.flac" });
    expect(getTrackThumbUrl(track, "sm")).toMatch(
      /^\/imagesw\/thmcache\/[a-f0-9]{32}_sm\.jpg$/,
    );
  });

  it("returns the radio icon for radio tracks", () => {
    resolveSourceMock.mockReturnValue(undefined);
    const track = t({ file: "http://stream.example.com/live" });
    expect(getTrackThumbUrl(track, "sm", [], null)).toBe("/images/radio_icon.png");
  });
});
