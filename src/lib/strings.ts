// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Leaf string helpers with NO intra-lib imports. Broken out of utils.ts so
// radio.ts can use them without the utils↔radio import cycle (utils re-exports
// radio's station helpers; radio needed utils' generic string helpers).

export function isRemoteUrl(url: string | null | undefined): boolean {
  return !!url && (url.startsWith("http") || url.includes("://"));
}

export function normalizeForMatch(str: string | null | undefined): string {
  return (str || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}
