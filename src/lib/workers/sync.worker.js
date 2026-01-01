import { db } from "../db";
import md5 from "md5";

let apiUrl;

function decodeEntities(str) {
  if (!str) return "";
  if (typeof str !== "string") return String(str);
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === "START_SYNC") {
    apiUrl = payload.url;
    await startSync();
  }
};

async function startSync() {
  try {
    self.postMessage({ type: "PROGRESS", status: "connecting" });

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `HTTP Error ${response.status}: ${errText.substring(0, 100)}`,
      );
    }

    self.postMessage({ type: "PROGRESS", status: "downloading" });

    const textData = await response.text();
    const trimmed = textData.trim();

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

    let rawData;
    try {
      rawData = JSON.parse(textData);
    } catch (e) {
      throw new Error("JSON Parse Error: " + e.message);
    }

    if (!Array.isArray(rawData)) {
      if (rawData.error) {
        throw new Error("API Error: " + rawData.error);
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
      count: rawData.length,
    });

    const tracks = rawData.map((item) => {
      // Нормализуем путь сразу при получении от сервера
      const normalizedFile = (item.file || "").normalize("NFC");

      let thumbHash = null;
      if (normalizedFile) {
        try {
          const lastSlashIndex = normalizedFile.lastIndexOf("/");
          const dirPath =
            lastSlashIndex === -1
              ? "."
              : normalizedFile.substring(0, lastSlashIndex);

          thumbHash = md5(dirPath);
        } catch (err) {
          // ignore error
        }
      }

      const rawArtist = Array.isArray(item.artist)
        ? item.artist.join(", ")
        : item.artist;
      const rawGenre = Array.isArray(item.genre)
        ? item.genre.join(", ")
        : item.genre;

      const rawAlbumArtist =
        item.album_artist || item.albumartist || item.AlbumArtist;

      let qualityBadge = null;
      if (item.encoded_at) {
        qualityBadge = item.encoded_at.replace(/,/g, " ").trim();
      }

      return {
        file: normalizedFile,
        title: decodeEntities(item.title || normalizedFile.split("/").pop()),
        artist: decodeEntities(rawArtist || "Unknown Artist"),
        album: decodeEntities(item.album || "Unknown Album"),
        genre: decodeEntities(rawGenre || "Unknown"),
        album_artist: rawAlbumArtist ? decodeEntities(rawAlbumArtist) : null,

        time: parseFloat(item.time || 0),
        track: parseInt(item.tracknum || 0),
        disc: parseInt(item.disc || 1),
        year: parseInt(item.year || 0),

        encoded_at: item.encoded_at,
        last_modified: item.last_modified,

        thumbHash: thumbHash,
        qualityBadge: qualityBadge,
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
    self.postMessage({ type: "ERROR", message: e.message });
  }
}
