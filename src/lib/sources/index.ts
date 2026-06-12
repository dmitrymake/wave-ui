// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
// Importing this module registers every available track source. Import it once
// from the composition root so the registry is populated before playback starts.
import type { DaemonBanner, SourceRoute } from "./trackSource";
import { listTrackSources } from "./trackSource";
export * from "./trackSource";
import "./yandexSource";

/**
 * The daemon of the first registered source that exposes a `.daemon` capability,
 * if any. This bakes in a single-active-daemon assumption: only the first such
 * source's daemon banner is surfaced. Revisit if a second streaming source with
 * its own daemon is ever registered (today only Yandex has one).
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
