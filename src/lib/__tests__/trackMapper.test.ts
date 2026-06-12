// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";
import md5 from "md5";
import { decodeEntities, mapRawTrack } from "../trackMapper";

describe("decodeEntities", () => {
  it("decodes the supported HTML entities", () => {
    expect(decodeEntities("Rock &amp; Roll")).toBe("Rock & Roll");
    expect(decodeEntities("&quot;Quoted&quot;")).toBe('"Quoted"');
    expect(decodeEntities("It&#039;s")).toBe("It's");
    expect(decodeEntities("&lt;tag&gt;")).toBe("<tag>");
  });

  it("returns empty string for nullish input", () => {
    expect(decodeEntities(null)).toBe("");
    expect(decodeEntities(undefined)).toBe("");
    expect(decodeEntities("")).toBe("");
  });

  it("leaves plain text untouched", () => {
    expect(decodeEntities("Plain Title")).toBe("Plain Title");
  });
});

describe("mapRawTrack", () => {
  it("joins multi-value artist and genre arrays", () => {
    const t = mapRawTrack({
      file: "Music/A/Album/01.flac",
      artist: ["Alice", "Bob"],
      genre: ["Rock", "Pop"],
    });
    expect(t.artist).toBe("Alice, Bob");
    expect(t.genre).toBe("Rock, Pop");
  });

  it("falls back to Unknown Artist / Unknown / Unknown Album when tags are missing", () => {
    const t = mapRawTrack({ file: "x/y/z.mp3" });
    expect(t.artist).toBe("Unknown Artist");
    expect(t.genre).toBe("Unknown");
    expect(t.album).toBe("Unknown Album");
  });

  it("uses the filename as the title when title is missing", () => {
    const t = mapRawTrack({ file: "Music/A/Album/My Song.flac" });
    expect(t.title).toBe("My Song.flac");
  });

  it("decodes entities in tag values", () => {
    const t = mapRawTrack({
      file: "f.mp3",
      title: "AC&amp;DC &quot;Live&quot;",
      artist: "Sigur R&#039;os",
    });
    expect(t.title).toBe('AC&DC "Live"');
    expect(t.artist).toBe("Sigur R'os");
  });

  it("NFC-normalises decomposed unicode in file and tags", () => {
    // Built from char codes so the source stays pure-ASCII and unambiguous.
    const decomposed = "caf" + "e" + String.fromCharCode(0x0301); // NFD: e + combining acute
    const composed = "caf" + String.fromCharCode(0x00e9); //          NFC: precomposed e-acute
    expect(decomposed).not.toBe(composed); // sanity: differ before normalisation
    const t = mapRawTrack({ file: `Music/${decomposed}/x.flac`, artist: decomposed });
    expect(t.artist).toBe(composed);
    expect(t.file).toBe(`Music/${composed}/x.flac`);
  });

  it("resolves album_artist via the album_artist || albumartist || AlbumArtist chain", () => {
    expect(mapRawTrack({ file: "f", album_artist: "AA" }).album_artist).toBe("AA");
    expect(mapRawTrack({ file: "f", albumartist: "aa" }).album_artist).toBe("aa");
    expect(mapRawTrack({ file: "f", AlbumArtist: "Aa" }).album_artist).toBe("Aa");
    expect(mapRawTrack({ file: "f" }).album_artist).toBeUndefined();
  });

  it("derives thumbHash from the md5 of the directory path", () => {
    const t = mapRawTrack({ file: "Music/Artist/Album/01.flac" });
    expect(t.thumbHash).toBe(md5("Music/Artist/Album"));
  });

  it("uses '.' as the directory for a file with no slash", () => {
    const t = mapRawTrack({ file: "track.flac" });
    expect(t.thumbHash).toBe(md5("."));
  });

  it("coerces numeric fields from both string and number inputs", () => {
    const fromStrings = mapRawTrack({
      file: "f",
      time: "215.5",
      tracknum: "7",
      disc: "2",
      year: "2021",
    });
    expect(fromStrings.time).toBe(215.5);
    expect(fromStrings.track).toBe("7");
    expect(fromStrings.disc).toBe("2");
    expect(fromStrings.year).toBe(2021);

    const fromNumbers = mapRawTrack({ file: "f", time: 90, tracknum: 3, disc: 1, year: 1999 });
    expect(fromNumbers.time).toBe(90);
    expect(fromNumbers.track).toBe("3");
    expect(fromNumbers.year).toBe(1999);
  });

  it("defaults disc to 1 and track/time/year to 0 when absent", () => {
    const t = mapRawTrack({ file: "f" });
    expect(t.disc).toBe("1");
    expect(t.track).toBe("0");
    expect(t.time).toBe(0);
    expect(t.year).toBe(0);
  });

  it("turns encoded_at into a qualityBadge (commas to spaces, trimmed); undefined when absent", () => {
    expect(mapRawTrack({ file: "f", encoded_at: "FLAC,16,44.1" }).qualityBadge).toBe("FLAC 16 44.1");
    expect(mapRawTrack({ file: "f" }).qualityBadge).toBeUndefined();
  });

  it("trims surrounding whitespace on the file key", () => {
    expect(mapRawTrack({ file: "  Music/x.flac  " }).file).toBe("Music/x.flac");
  });
});
