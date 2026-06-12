// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake

// Centralised MPD argument escaping. MPD's protocol quotes string arguments with
// double quotes, so a literal `"` inside an argument terminates the quoted string
// unless escaped. Keeping the convention here prevents it from being re-implemented —
// and silently drifting — at every command-building call site.

// MPD's protocol delimits commands with a newline, so a literal CR/LF inside an
// argument would terminate the current command and let an attacker inject a fresh
// MPD command via a crafted playlist name, path or stream URL. There is no way to
// escape these for MPD, so we strip them entirely after the quote/backslash escaping
// (running last keeps the escape sequences themselves intact).
function stripControlChars(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

// For plain string arguments such as playlist names: escape only the double quote,
// matching the convention used across the playlist/library commands.
export function escapeArg(value: string | null | undefined): string {
  return stripControlChars(String(value ?? "").replace(/"/g, '\\"'));
}

// For file/stream paths: NFC-normalise (to match the IndexedDB key normalisation) and
// escape backslashes as well as quotes, since paths can legitimately contain them.
export function escapePath(str: string | null | undefined): string {
  if (!str) return "";
  return stripControlChars(
    String(str)
      .normalize("NFC")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"'),
  );
}
