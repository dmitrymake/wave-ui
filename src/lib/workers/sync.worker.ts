// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { db } from "../db";
import { mapRawTrack, type RawTrackData } from "../trackMapper";
import type { DbTrack } from "../types";

let apiUrl: string;

interface SyncMessage {
  type: string;
  payload: { url: string };
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

    // Hard deadline so a half-open connection can't hang the worker until the
    // main-thread 120s watchdog; AbortSignal.timeout is available in workers.
    const response: Response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(60_000),
    });

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

    const tracks: DbTrack[] = (rawData as RawTrackData[]).map(mapRawTrack);

    self.postMessage({
      type: "PROGRESS",
      status: "saving",
      count: tracks.length,
    });

    // Atomic swap: a mid-write failure rolls back and keeps the previous cache,
    // instead of leaving the store wiped by a separate clear() that already committed.
    await db.replaceAll(tracks);

    self.postMessage({ type: "DONE", count: tracks.length });
  } catch (e) {
    console.error(e);
    self.postMessage({ type: "ERROR", message: (e as Error).message });
  }
}
