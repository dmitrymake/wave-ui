// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake

// Centralised MPD argument escaping. MPD's protocol quotes string arguments with
// double quotes, so a literal `"` inside an argument terminates the quoted string
// unless escaped. Keeping the convention here prevents it from being re-implemented —
// and silently drifting — at every command-building call site.

// For plain string arguments such as playlist names: escape only the double quote,
// matching the convention used across the playlist/library commands.
export function escapeArg(value: string | null | undefined): string {
  return String(value ?? "").replace(/"/g, '\\"');
}

// For file/stream paths: NFC-normalise (to match the IndexedDB key normalisation) and
// escape backslashes as well as quotes, since paths can legitimately contain them.
export function escapePath(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .normalize("NFC")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}
