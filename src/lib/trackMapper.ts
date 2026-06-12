// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import md5 from "md5";
import type { DbTrack, LibraryItem, Track } from "./types";

// Raw track shape as delivered by the moOde library API. Values are loosely typed —
// a tag can arrive as a string, a string[] (multi-value tags), or a number.
export interface RawTrackData {
  file?: string;
  title?: string;
  artist?: string | string[];
  album?: string;
  genre?: string | string[];
  album_artist?: string;
  albumartist?: string;
  AlbumArtist?: string;
  time?: string | number;
  tracknum?: string | number;
  disc?: string | number;
  year?: string | number;
  encoded_at?: string;
  last_modified?: string;
}

// Decode the small set of HTML entities the PHP backend emits in tag values.
export function decodeEntities(str: string | null | undefined): string {
  if (!str) return "";
  if (typeof str !== "string") return String(str);
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Normalise one raw library row into the DbTrack stored in IndexedDB. Pure (no I/O),
// so it is unit-testable; the sync worker maps the entire library through it. Keeping
// it here means a regression in entity-decoding / NFC normalisation is caught by tests
// rather than silently corrupting the whole cached library.
export function mapRawTrack(item: RawTrackData): DbTrack {
  const file: string = (item.file || "").normalize("NFC").trim();
  const title: string = decodeEntities(item.title || file.split("/").pop())
    .normalize("NFC")
    .trim();

  const rawArtist: string = Array.isArray(item.artist)
    ? item.artist.join(", ")
    : item.artist || "Unknown Artist";
  const artist: string = decodeEntities(rawArtist).normalize("NFC").trim();

  const album: string = decodeEntities(item.album || "Unknown Album")
    .normalize("NFC")
    .trim();

  const rawGenre: string = Array.isArray(item.genre)
    ? item.genre.join(", ")
    : item.genre || "Unknown";
  const genre: string = decodeEntities(rawGenre).normalize("NFC").trim();

  const rawAlbumArtist: string | undefined =
    item.album_artist || item.albumartist || item.AlbumArtist;
  const album_artist: string | undefined = rawAlbumArtist
    ? decodeEntities(rawAlbumArtist).normalize("NFC").trim()
    : undefined;

  // Effective grouping artist for the composite [album, albumKey] index. Mirrors the
  // album_artist || artist fallback used throughout db.ts, but is always populated so
  // the index never drops a record (and so same-named albums by different artists stay
  // distinct). album_artist itself keeps its undefined-when-absent contract.
  const albumKey: string = album_artist || artist;

  let thumbHash: string | undefined;
  if (file) {
    try {
      const lastSlashIndex: number = file.lastIndexOf("/");
      const dirPath: string =
        lastSlashIndex === -1 ? "." : file.substring(0, lastSlashIndex);

      thumbHash = md5(dirPath);
    } catch (err) {
      console.warn("Failed to generate thumb hash for", file);
    }
  }

  let qualityBadge: string | undefined;
  if (item.encoded_at) {
    qualityBadge = item.encoded_at.replace(/,/g, " ").trim();
  }

  return {
    file,
    title,
    artist,
    album,
    genre,
    album_artist,
    albumKey,

    time: parseFloat(String(item.time || 0)),
    track: String(parseInt(String(item.tracknum || 0))),
    disc: String(parseInt(String(item.disc || 1))),
    year: parseInt(String(item.year || 0)),

    thumbHash,
    qualityBadge,
  };
}

// Bridge a library-list row to a full Track. LibraryItem is a loose view-model
// (album/artist/track rows share it) so it omits Track's required fields; for
// `tracks_by_album` the row IS already a DbTrack, the rest of the time only the
// artwork/playback fields (file, thumbHash, displayName) are meaningful. This
// fills the required Track shape explicitly instead of an `as unknown as` cast,
// so the conversion is structurally checked.
export function libraryItemToTrack(item: LibraryItem): Track {
  return {
    file: item.file ?? "",
    title: item.title ?? item.name ?? item.displayName ?? "",
    artist: item.artist ?? "",
    // tracks_by_album rows carry the real album; list rows don't, so fall back
    // to the row name (mirrors the values the old DbTrack cast exposed).
    album: item.album ?? item.name ?? "",
    genre: "",
    time: item.time ?? 0,
    track: item.track ?? "",
    year: item.year ? parseInt(item.year) || undefined : undefined,
    thumbHash: item.thumbHash,
    qualityBadge: item.qualityBadge,
    _uid: item._uid,
  };
}
