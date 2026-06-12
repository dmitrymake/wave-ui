// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import type { LibraryItem } from "./types";

/**
 * Sort library items by the given option. For the "artist" option, group-header
 * rows (isHeader) are inserted before each new artist.
 */
export function sortItems(items: LibraryItem[], option: string): LibraryItem[] {
  if (!items || items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    switch (option) {
      case "name":
        return a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        });

      case "artist": {
        const cmp = (a.artist || "").localeCompare(b.artist || "", undefined, {
          sensitivity: "base",
        });
        if (cmp !== 0) return cmp;
        return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);
      }

      case "year":
        return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);

      case "year_desc":
        return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);

      default:
        return 0;
    }
  });

  if (option === "artist") {
    const grouped: LibraryItem[] = [];
    let lastArtist: string | null = null;

    sorted.forEach((item) => {
      const currentArtist = item.artist || "Unknown Artist";
      if (currentArtist !== lastArtist) {
        grouped.push({
          _uid: `header-${currentArtist}`,
          isHeader: true,
          title: currentArtist,
          displayName: currentArtist,
          thumbFile: null,
          year: "",
        });
        lastArtist = currentArtist;
      }
      grouped.push(item);
    });
    return grouped;
  }

  return sorted;
}
