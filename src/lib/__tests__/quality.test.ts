// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";
import {
  parseQuality,
  qualityLabel,
  formatQuality,
  formatChannels,
  summarizeQuality,
  HI_RES_LABEL,
  MIXED_LABEL,
} from "../quality";

const NBSP = " ";

describe("parseQuality", () => {
  it("reads every value this library actually has (stored form: commas → spaces)", () => {
    expect(parseQuality("MP3 l 2")).toEqual({ format: "MP3", resolution: null, tier: "lossy", channels: 2 });
    expect(parseQuality("FLAC 16/44.1 s 2")).toEqual({ format: "FLAC", resolution: "16/44.1", tier: "cd", channels: 2 });
    expect(parseQuality("FLAC 24/44.1 h 2")).toEqual({ format: "FLAC", resolution: "24/44.1", tier: "hires", channels: 2 });
    expect(parseQuality("FLAC 24/192 h 2")).toEqual({ format: "FLAC", resolution: "24/192", tier: "hires", channels: 2 });
    expect(parseQuality("FLAC 16/48 h 2")).toEqual({ format: "FLAC", resolution: "16/48", tier: "hires", channels: 2 });
  });

  it("accepts moOde's raw comma form too", () => {
    expect(parseQuality("FLAC 24/96,h,1")).toEqual({ format: "FLAC", resolution: "24/96", tier: "hires", channels: 1 });
    expect(parseQuality("MP3,l,2")).toEqual({ format: "MP3", resolution: null, tier: "lossy", channels: 2 });
  });

  it("tolerates partial and older shapes", () => {
    expect(parseQuality("FLAC")).toEqual({ format: "FLAC", resolution: null, tier: null, channels: null });
    expect(parseQuality("FLAC h")).toEqual({ format: "FLAC", resolution: null, tier: "hires", channels: null });
    // The mapper's old comma form "FLAC,16,44.1" becomes "FLAC 16 44.1".
    expect(parseQuality("FLAC 16 44.1")?.resolution).toBe("16/44.1");
  });

  it("keeps an unknown qualifier with the format instead of dropping it", () => {
    expect(parseQuality("DSD 64 h 2")).toEqual({ format: `DSD${NBSP}64`, resolution: null, tier: "hires", channels: 2 });
  });

  it("returns null for nothing", () => {
    expect(parseQuality(undefined)).toBeNull();
    expect(parseQuality(null)).toBeNull();
    expect(parseQuality("")).toBeNull();
    expect(parseQuality("  , , ")).toBeNull();
  });
});

describe("qualityLabel / formatQuality", () => {
  it("never prints moOde's class letter or a stereo channel count", () => {
    expect(formatQuality("MP3 l 2")).toBe("MP3");
    expect(formatQuality("FLAC 24/192 h 2")).toBe(`FLAC${NBSP}24/192`);
    expect(formatQuality("FLAC 16/44.1 s 2")).toBe(`FLAC${NBSP}16/44.1`);
  });

  it("names non-stereo layouts", () => {
    expect(formatQuality("FLAC 16/44.1 s 1")).toBe(`FLAC${NBSP}16/44.1 · Mono`);
    expect(formatQuality("FLAC 24/96 h 6")).toBe(`FLAC${NBSP}24/96 · 5.1`);
    expect(formatQuality("FLAC 24/96 h 8")).toBe(`FLAC${NBSP}24/96 · 7.1`);
    expect(formatChannels(3)).toBe(`3${NBSP}ch`);
    expect(formatChannels(2)).toBeNull();
    expect(formatChannels(null)).toBeNull();
  });

  it("the short style is the codec alone (rows and cards)", () => {
    expect(formatQuality("FLAC 24/192 h 2", "short")).toBe("FLAC");
    expect(formatQuality("MP3 l 2", "short")).toBe("MP3");
    expect(qualityLabel(null)).toBe("");
    expect(formatQuality(undefined, "short")).toBe("");
  });
});

describe("summarizeQuality", () => {
  it("one label when every file agrees, flagged hi-res by moOde's tier", () => {
    expect(summarizeQuality(["FLAC 24/192 h 2", "FLAC 24/192 h 2"])).toEqual({
      label: `FLAC${NBSP}24/192`,
      hiRes: true,
      mixed: false,
    });
    expect(summarizeQuality(["MP3 l 2", "MP3 l 2"])).toEqual({ label: "MP3", hiRes: false, mixed: false });
  });

  it("falls back to the shared codec when only the resolutions differ", () => {
    expect(summarizeQuality(["FLAC 24/96 h 2", "FLAC 16/44.1 s 2"])).toEqual({
      label: "FLAC",
      hiRes: false,
      mixed: false,
    });
    expect(summarizeQuality(["FLAC 24/96 h 2", "FLAC 24/192 h 2"])?.hiRes).toBe(true);
  });

  it("says Mixed when the codecs differ, and ignores untagged files", () => {
    expect(summarizeQuality(["MP3 l 2", undefined, "FLAC 16/44.1 s 2"])).toEqual({
      label: MIXED_LABEL,
      hiRes: false,
      mixed: true,
    });
    expect(summarizeQuality([undefined, null, ""])).toBeNull();
    expect(summarizeQuality([])).toBeNull();
  });

  it("exports the hi-res label the header prints", () => {
    expect(HI_RES_LABEL).toBe("Hi-Res");
  });
});
