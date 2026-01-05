import { get } from "svelte/store";
import {
  activeMenuTab,
  navigationStack,
  searchQuery,
  consumeRouteData,
} from "./store";

export const Router = {
  init() {
    this.handleHashChange();
    window.addEventListener("hashchange", () => this.handleHashChange());
  },

  handleHashChange() {
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

    const parts = raw.split("/").map(decodeURIComponent);
    const route = parts[0];

    let data = consumeRouteData();

    if (!data) {
      if (parts.length > 1) {
        if (route === "album" && parts.length >= 3) {
          // ФОРМАТ: #/album/Artist Name/Album Name
          data = { artist: parts[1], name: parts[2] };
        } else if (route === "artist" && parts.length >= 2) {
          data = { name: parts[1] };
        } else {
          // Старый формат (fallback)
          data = { name: parts[1], displayName: parts[1] };
        }
      }
    }

    console.log(`[Router] Navigating: ${route}`, data);

    switch (route) {
      case "queue":
        this.setRootTab("queue");
        break;
      case "radio":
        this.setRootTab("radio");
        break;
      case "playlists":
        this.setRootTab("playlists");
        break;
      case "settings":
        this.setRootTab("settings");
        break;
      case "favorites":
        activeMenuTab.set("favorites");
        navigationStack.set([
          { view: "root" },
          { view: "details", data: { name: "Favorites" } },
        ]);
        break;

      case "artists":
        this.setRootTab("artists");
        break;
      case "albums":
        this.setRootTab("albums");
        break;
      case "search":
        activeMenuTab.set("search");
        if (parts[1]) searchQuery.set(parts[1]);
        navigationStack.set([{ view: "root" }]);
        break;

      case "album":
        activeMenuTab.set("albums");
        navigationStack.set([
          { view: "root" },
          { view: "tracks_by_album", data: data },
        ]);
        break;

      case "artist":
        activeMenuTab.set("artists");
        navigationStack.set([
          { view: "root" },
          { view: "albums_by_artist", data: data },
        ]);
        break;

      case "playlist":
        activeMenuTab.set("playlists");
        navigationStack.set([
          { view: "root" },
          { view: "details", data: data },
        ]);
        break;

      default:
        this.setRootTab("artists");
        break;
    }
  },

  setRootTab(tab) {
    activeMenuTab.set(tab);
    navigationStack.set([{ view: "root" }]);
  },

  updateUrl(view, data) {
    let newPath = "";

    if (view === "root") {
      const tab = get(activeMenuTab);
      if (tab === "search") {
        const q = get(searchQuery);
        newPath = q ? `search/${encodeURIComponent(q)}` : "search";
      } else {
        newPath = tab;
      }
    } else if (view === "details") {
      const name = data.name || data;
      newPath =
        name === "Favorites"
          ? "favorites"
          : `playlist/${encodeURIComponent(name)}`;
    } else if (view === "albums_by_artist") {
      const name = data.name || data;
      newPath = `artist/${encodeURIComponent(name)}`;
    } else if (view === "tracks_by_album") {
      const name = data.name || data;
      const artist = data.artist;

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
      if (
        decodeURIComponent(window.location.hash) !==
        decodeURIComponent(nextHash)
      ) {
        window.location.hash = `/${newPath}`;
      }
    }
  },
};
