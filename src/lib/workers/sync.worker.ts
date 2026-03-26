// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { db } from "../db";
import md5 from "md5";
import type { DbTrack } from "../types";

let apiUrl: string;

interface RawTrackData {
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

interface SyncMessage {
  type: string;
  payload: { url: string };
}

function decodeEntities(str: string | null | undefined): string {
  if (!str) return "";
  if (typeof str !== "string") return String(str);
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

self.onmessage = async (e: MessageEvent<SyncMessage>) => {
  const { type, payload } = e.data;

  if (type === "START_SYNC") {
    apiUrl = payload.url;
    await startSync();
  }
};

async function startSync(): Promise<void> {
  try {
    self.postMessage({ type: "PROGRESS", status: "connecting" });

    const response: Response = await fetch(apiUrl);

    if (!response.ok) {
      const errText: string = await response.text();
      throw new Error(
        `HTTP Error ${response.status}: ${errText.substring(0, 100)}`,
      );
    }

    self.postMessage({ type: "PROGRESS", status: "downloading" });

    const textData: string = await response.text();
    const trimmed: string = textData.trim();

    if (trimmed.length === 0) {
      throw new Error("Server returned empty response");
    }

    if (trimmed.charAt(0) !== "[" && trimmed.charAt(0) !== "{") {
      console.error(
        "CRITICAL: Server returned non-JSON data:",
        textData.substring(0, 500),
      );
      throw new Error(
        `Invalid JSON. Server says: ${textData.substring(0, 100)}...`,
      );
    }

    let rawData: RawTrackData[] | Record<string, unknown>;
    try {
      rawData = JSON.parse(textData);
    } catch (e) {
      throw new Error("JSON Parse Error: " + (e as Error).message);
    }

    if (!Array.isArray(rawData)) {
      if ((rawData as Record<string, unknown>).error) {
        throw new Error("API Error: " + (rawData as Record<string, unknown>).error);
      }
      if (Object.keys(rawData).length === 0) {
        rawData = [];
      } else {
        throw new Error("Invalid response format: expected JSON array");
      }
    }

    self.postMessage({
      type: "PROGRESS",
      status: "parsing",
      count: (rawData as RawTrackData[]).length,
    });

    const tracks: DbTrack[] = (rawData as RawTrackData[]).map((item) => {
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

        time: parseFloat(String(item.time || 0)),
        track: String(parseInt(String(item.tracknum || 0))),
        disc: String(parseInt(String(item.disc || 1))),
        year: parseInt(String(item.year || 0)),

        thumbHash,
        qualityBadge,
      };
    });

    self.postMessage({
      type: "PROGRESS",
      status: "saving",
      count: tracks.length,
    });

    await db.clear();
    await db.bulkAdd(tracks);

    self.postMessage({ type: "DONE", count: tracks.length });
  } catch (e) {
    console.error(e);
    self.postMessage({ type: "ERROR", message: (e as Error).message });
  }
}
