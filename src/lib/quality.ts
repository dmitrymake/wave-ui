// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
/**
 * What the user reads for moOde's audio-quality tag. Display only: nothing here
 * touches the stored value.
 *
 * moOde's library reports `encoded_at` as
 *     "<format>[ <bits>/<kHz>],<class>,<channels>"
 * e.g. "FLAC 24/192,h,2", "FLAC 16/44.1,s,2", "MP3,l,2", where the class is
 * l = lossy, s = standard (CD) and h = hi-res by moOde's own rule (anything
 * above 16/44.1, so 16/48 counts). The sync worker stores it with the commas
 * turned into spaces as `qualityBadge` ("FLAC 24/192 h 2", "MP3 l 2") — and the
 * album header used to print exactly that: "MP3 l 2", which reads "MP3 I 2".
 *
 * Decisions:
 * - the class letter is never shown. It becomes a tier, and only the tier that
 *   means something to a listener is spelled out: "Hi-Res", as its own badge.
 *   A CD-quality or lossy file already says what it is ("FLAC 16/44.1", "MP3").
 * - channels are shown only when they are not stereo: "Mono", "5.1", "7.1",
 *   otherwise "N ch".
 * - a format and its resolution are one unit, joined by a no-break space so
 *   "FLAC 24/192" never wraps in the middle.
 */

export type QualityTier = "lossy" | "cd" | "hires";

export interface AudioQuality {
  /** Codec as moOde names it: "FLAC", "MP3", "DSD64", "AAC"… */
  format: string;
  /** Bit depth / sample rate in kHz, "24/192". Null for lossy files. */
  resolution: string | null;
  tier: QualityTier | null;
  channels: number | null;
}

export interface QualitySummary {
  /** The badge text: one full label, one shared codec, or "Mixed". */
  label: string;
  /** Every file with a known tier is hi-res — worth its own badge. */
  hiRes: boolean;
  mixed: boolean;
}

export const HI_RES_LABEL = "Hi-Res";
export const MIXED_LABEL = "Mixed";

const NBSP = " ";
const TIERS: Record<string, QualityTier> = { l: "lossy", s: "cd", h: "hires" };
const tierOf = (token: string | undefined): QualityTier | undefined =>
  token === undefined ? undefined : TIERS[token.toLowerCase()];

/** Parse a stored `qualityBadge` (or a raw moOde `encoded_at`). Null when empty. */
export function parseQuality(raw: string | null | undefined): AudioQuality | null {
  if (raw === null || raw === undefined) return null;
  const tokens = String(raw).replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let channels: number | null = null;
  let tier: QualityTier | null = null;

  // Peel the trailing "<class> <channels>" pair, or a lone class letter.
  const last = tokens[tokens.length - 1];
  if (tokens.length >= 3 && /^\d+$/.test(last) && tierOf(tokens[tokens.length - 2])) {
    channels = Number(tokens.pop());
    tier = tierOf(tokens.pop()) ?? null;
  } else if (tokens.length >= 2 && tierOf(last)) {
    tier = tierOf(tokens.pop()) ?? null;
  }

  const format = tokens.shift() ?? "";
  if (!format) return null;

  // What is left is the resolution: "24/192", or the older "16 44.1" form.
  if (tokens.length === 0) return { format, resolution: null, tier, channels };
  if (tokens.length === 1 && /^\d+\/\d+(\.\d+)?$/.test(tokens[0])) {
    return { format, resolution: tokens[0], tier, channels };
  }
  if (tokens.length === 2 && tokens.every((t) => /^\d+(\.\d+)?$/.test(t))) {
    return { format, resolution: `${tokens[0]}/${tokens[1]}`, tier, channels };
  }
  // Something this parser does not know (a DSD rate spelled "DSD 64", say): keep
  // it with the format rather than silently drop it.
  return { format: [format, ...tokens].join(NBSP), resolution: null, tier, channels };
}

/** "Mono" / "5.1" / "7.1" / "3 ch"; null for stereo or unknown. */
export function formatChannels(channels: number | null): string | null {
  if (!channels || channels === 2) return null;
  if (channels === 1) return "Mono";
  if (channels === 6) return "5.1";
  if (channels === 8) return "7.1";
  return `${channels}${NBSP}ch`;
}

/**
 * "short": the codec alone ("FLAC", "MP3") — a row or a card.
 * "full":  codec + resolution + non-stereo channels ("FLAC 24/192",
 *          "FLAC 16/44.1 · Mono", "MP3") — a header or the player.
 */
export function qualityLabel(q: AudioQuality | null, style: "short" | "full" = "full"): string {
  if (!q || !q.format) return "";
  if (style === "short") return q.format;
  const head = q.resolution ? `${q.format}${NBSP}${q.resolution}` : q.format;
  const channels = formatChannels(q.channels);
  return channels ? `${head} · ${channels}` : head;
}

/** Shorthand for the common case: a stored string straight to its label. */
export function formatQuality(raw: string | null | undefined, style: "short" | "full" = "full"): string {
  return qualityLabel(parseQuality(raw), style);
}

/**
 * One badge for a set of files (an album, a playlist): the full label when they
 * all agree, the shared codec when only the resolutions differ, "Mixed" when
 * the codecs do. Files without a tag are ignored; null when none has one.
 */
export function summarizeQuality(raws: ReadonlyArray<string | null | undefined>): QualitySummary | null {
  const all = raws.map(parseQuality).filter((q): q is AudioQuality => q !== null);
  if (all.length === 0) return null;

  const tiered = all.filter((q) => q.tier !== null);
  const hiRes = tiered.length > 0 && tiered.every((q) => q.tier === "hires");

  const labels = new Set(all.map((q) => qualityLabel(q, "full")));
  if (labels.size === 1) return { label: [...labels][0], hiRes, mixed: false };

  const formats = new Set(all.map((q) => q.format));
  if (formats.size === 1) return { label: [...formats][0], hiRes, mixed: false };

  return { label: MIXED_LABEL, hiRes: false, mixed: true };
}
