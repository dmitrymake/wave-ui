// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Importing this module registers every available track source. Import it once
// from the composition root so the registry is populated before playback starts.
// To add a new streaming service (e.g. YouTube Music): create
// `./<service>Source.ts` exporting a TrackSource with `id`, `matches()`,
// `routes` (SourceRoute[]) and optional `daemon`, then import it below for its
// side-effect `registerTrackSource(...)` call. No router/player changes needed.
import type { DaemonBanner, SourceRoute } from "./trackSource";
import { listTrackSources } from "./trackSource";
export * from "./trackSource";
export * from "./streamCache";
import "./yandexSource";

/**
 * All daemons exposed by registered sources, in registration order. Most apps
 * show only the first active one (see getActiveDaemon), but a second streaming
 * source (YouTube Music) gets its own banner instead of being silently dropped.
 */
export function listActiveDaemons(): DaemonBanner[] {
  return listTrackSources()
    .map((s) => s.daemon)
    .filter((d): d is DaemonBanner => !!d);
}

/**
 * The daemon of the first registered source that exposes a `.daemon` capability,
 * if any. Kept for backward compat; prefer listActiveDaemons() when adding a
 * second streaming source with its own daemon.
 */
export function getActiveDaemon(): DaemonBanner | undefined {
  return listTrackSources().find((s) => s.daemon)?.daemon;
}

/** Every route declared by every registered source, in registration order. */
function listSourceRoutes(): SourceRoute[] {
  return listTrackSources().flatMap((s) => s.routes ?? []);
}

/** The source route owning the given first hash segment, if any (parse side). */
export function matchRouteByPrefix(prefix: string): SourceRoute | undefined {
  return listSourceRoutes().find((r) => r.routePrefix === prefix);
}

/** The source route mapping to the given navigation view, if any (serialize side). */
export function matchRouteByView(viewName: string): SourceRoute | undefined {
  return listSourceRoutes().find((r) => r.viewName === viewName);
}

/**
 * The menu tab a bare segment owns as its source's tab root (e.g. "yandex"). Lets
 * the router treat a source's tab segment generically: activate the tab and reset
 * the stack to root, without naming any concrete service.
 */
export function matchTabRoot(segment: string): SourceRoute | undefined {
  return listSourceRoutes().find((r) => r.menuTab === segment);
}
