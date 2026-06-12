// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect } from "vitest";
import { escapeArg, escapePath } from "../../mpd/escape.js";

describe("escapeArg", () => {
  it("leaves a plain string untouched", () => {
    expect(escapeArg("My Playlist")).toBe("My Playlist");
  });

  it("escapes double quotes", () => {
    expect(escapeArg('say "hi"')).toBe('say \\"hi\\"');
  });

  it("leaves a lone backslash untouched (escapeArg does not escape backslashes)", () => {
    expect(escapeArg("a\\b")).toBe("a\\b");
  });

  it("strips a newline", () => {
    expect(escapeArg("a\nb")).toBe("ab");
  });

  it("strips a carriage return", () => {
    expect(escapeArg("a\rb")).toBe("ab");
  });

  it("strips a CRLF sequence", () => {
    expect(escapeArg("a\r\nb")).toBe("ab");
  });

  it("neutralises a quote + newline command-injection attempt", () => {
    // Attacker tries to close the quoted arg and append a fresh MPD command.
    const malicious = 'pl"\nclear';
    const escaped = escapeArg(malicious);
    expect(escaped).toBe('pl\\"clear');
    expect(escaped).not.toContain("\n");
    expect(escaped).not.toContain("\r");
  });

  it("returns empty string for empty input", () => {
    expect(escapeArg("")).toBe("");
  });

  it("handles null and undefined as empty string", () => {
    expect(escapeArg(null)).toBe("");
    expect(escapeArg(undefined)).toBe("");
  });
});

describe("escapePath", () => {
  it("leaves a plain path untouched", () => {
    expect(escapePath("USB/album/track.flac")).toBe("USB/album/track.flac");
  });

  it("escapes double quotes", () => {
    expect(escapePath('dir/"weird".mp3')).toBe('dir/\\"weird\\".mp3');
  });

  it("escapes backslashes", () => {
    expect(escapePath("a\\b")).toBe("a\\\\b");
  });

  it("strips a newline", () => {
    expect(escapePath("a\nb")).toBe("ab");
  });

  it("strips a carriage return", () => {
    expect(escapePath("a\rb")).toBe("ab");
  });

  it("strips a CRLF sequence", () => {
    expect(escapePath("a\r\nb")).toBe("ab");
  });

  it("neutralises a quote + newline command-injection attempt", () => {
    const malicious = 'song.flac"\nidle';
    const escaped = escapePath(malicious);
    expect(escaped).toBe('song.flac\\"idle');
    expect(escaped).not.toContain("\n");
    expect(escaped).not.toContain("\r");
  });

  it("NFC-normalises decomposed unicode", () => {
    // U+0065 U+0301 (e + combining acute) -> U+00E9 (é).
    const decomposed = "café";
    expect(escapePath(decomposed)).toBe("café");
  });

  it("returns empty string for empty/null/undefined input", () => {
    expect(escapePath("")).toBe("");
    expect(escapePath(null)).toBe("");
    expect(escapePath(undefined)).toBe("");
  });
});
