// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { get } from "svelte/store";
import {
  activeMenuTab,
  navigationStack,
  resetNavigation,
  pushNavigationEntry,
  searchQuery,
  consumeRouteData,
} from "./store";
import { logger } from "./logger";
import {
  matchRouteByPrefix,
  matchRouteByView,
  matchTabRoot,
} from "./sources";
import type { NavigationEntry, SourceRoute } from "./types.js";

// decodeURIComponent throws a URIError on malformed percent-escapes (a stray "%",
// a truncated "%E0"). A corrupted/pasted hash must not abort routing.
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export const Router = {
  init(): void {
    this.handleHashChange();
    window.addEventListener("hashchange", () => this.handleHashChange());
  },

  handleHashChange(): void {
    let raw = window.location.hash.slice(1);
    while (raw.startsWith("/")) {
      raw = raw.slice(1);
    }

    if (!raw) {
      if (get(navigationStack).length > 1 || get(activeMenuTab) === "search") {
        this.setRootTab("artists");
        window.location.hash = "/artists";
      }
      return;
    }

    const parts = raw.split("/").map(safeDecode);
    const route = parts[0];

    let data = consumeRouteData();
    let viewName = route;

    // A content route owned by a track source (e.g. a streaming service). The
    // source declares both the view it maps to and how to parse its params, so
    // the router stays agnostic of any concrete service's route literals.
    const sourceRoute: SourceRoute | undefined = matchRouteByPrefix(route);
    if (sourceRoute) viewName = sourceRoute.viewName;

    if (route === "artist") viewName = "albums_by_artist";
    if (route === "album") viewName = "tracks_by_album";
    if (route === "playlist") viewName = "details";
    if (route === "favorites") viewName = "details";

    if (!data) {
      if (sourceRoute) {
        // parseParams receives the parts AFTER the prefix.
        data = sourceRoute.parseParams(parts.slice(1));
      } else if (route === "album" && parts.length >= 2) {
        data =
          parts.length >= 3
            ? { artist: parts[1], name: parts[2] }
            : { name: parts[1] };
      } else if (route === "artist" && parts.length >= 2) {
        data = { name: parts[1] };
      } else if (route === "playlist" && parts.length >= 2) {
        data = { name: parts[1], displayName: parts[1] };
      } else if (route === "favorites") {
        data = { name: "Favorites" };
      } else if (parts.length >= 2) {
        data = { name: parts[1], displayName: parts[1] };
      }
    }

    // A bare source-tab segment with no detail parts: its source owns this segment
    // as a tab root, so we activate the tab and reset to root rather than pushing a
    // detail view. Content routes also carry the tab.
    const tabRootRoute: SourceRoute | undefined = matchTabRoot(route);
    const isTabRoot = !sourceRoute && tabRootRoute !== undefined;
    const routeMenuTab = sourceRoute?.menuTab ?? tabRootRoute?.menuTab;

    logger.log(`[Router] Navigating: ${route} -> ${viewName}`, data);

    switch (true) {
      case routeMenuTab !== undefined:
        activeMenuTab.set(routeMenuTab as string);
        break;
      case route === "queue":
        this.setRootTab("queue");
        return;
      case route === "radio":
        this.setRootTab("radio");
        return;
      case route === "playlists":
      case route === "playlist":
      case viewName === "details":
        if (data && data.name === "Favorites") activeMenuTab.set("favorites");
        else activeMenuTab.set("playlists");

        if (route === "playlists") {
          this.setRootTab("playlists");
          return;
        }
        break;
      case route === "settings":
        this.setRootTab("settings");
        return;
      case route === "favorites":
        activeMenuTab.set("favorites");
        break;
      case route === "search":
        activeMenuTab.set("search");
        if (parts[1]) searchQuery.set(parts[1]);
        resetNavigation();
        return;
      case route === "artists":
      case route === "artist":
        activeMenuTab.set("artists");
        if (route === "artists") {
          this.setRootTab("artists");
          return;
        }
        break;
      case route === "albums":
      case route === "album":
        activeMenuTab.set("albums");
        if (route === "albums") {
          this.setRootTab("albums");
          return;
        }
        break;
    }

    if (isTabRoot) {
      const current = get(navigationStack);
      if (current.length > 1 || current[0].view !== "root") {
        resetNavigation();
      }
    } else {
      const stack = get(navigationStack) as NavigationEntry[];
      const currentTop = stack[stack.length - 1];

      const isSameView = currentTop.view === viewName;
      let isSameData = false;

      if (data && currentTop.data) {
        const topData = currentTop.data as Record<string, unknown>;
        if (
          (data.name && data.name === topData.name) ||
          (data.id && data.id === topData.id) ||
          (data.uid && data.uid === topData.uid)
        ) {
          isSameData = true;
        }
      } else if (!data && !currentTop.data) {
        isSameData = true;
      }

      if (isSameView && isSameData) {
        return;
      }

      // Push when we have data, or when the matched source route allows an
      // empty-data view (the streaming-search-with-no-query case).
      if (data || sourceRoute?.allowEmptyData) {
        pushNavigationEntry(viewName, data);
      }
    }
  },

  setRootTab(tab: string): void {
    activeMenuTab.set(tab);
    resetNavigation();
  },

  updateUrl(view: string, data: Record<string, unknown> | null): void {
    let newPath = "";

    // A view owned by a track source serializes its own full hash path, so the
    // router never names a concrete service here.
    const sourceRoute = matchRouteByView(view);

    if (sourceRoute) {
      newPath = sourceRoute.buildPath(data) ?? "";
    } else if (view === "root") {
      const tab = get(activeMenuTab);
      if (tab === "search") {
        const q = get(searchQuery);
        newPath = q ? `search/${encodeURIComponent(q)}` : "search";
      } else {
        newPath = tab;
      }
    } else if (view === "details") {
      const name = (data?.name || data) as string;
      newPath =
        name === "Favorites"
          ? "favorites"
          : `playlist/${encodeURIComponent(name)}`;
    } else if (view === "albums_by_artist") {
      const name = (data?.name || data) as string;
      newPath = `artist/${encodeURIComponent(name)}`;
    } else if (view === "tracks_by_album") {
      const name = (data?.name || data) as string;
      const artist = data?.artist as string | undefined;
      if (artist) {
        newPath = `album/${encodeURIComponent(artist)}/${encodeURIComponent(name)}`;
      } else {
        newPath = `album/${encodeURIComponent(name)}`;
      }
    } else if (view === "queue") {
      newPath = "queue";
    }

    if (newPath) {
      const nextHash = `#/${newPath}`;
      if (safeDecode(window.location.hash) !== safeDecode(nextHash)) {
        // Search-style views (the source's empty-data-allowing search route, or
        // the local search) replace history rather than pushing a new entry.
        if (sourceRoute?.allowEmptyData || view === "search") {
          window.history.replaceState(null, "", nextHash);
        } else {
          window.location.hash = `/${newPath}`;
        }
      }
    }
  },
};
