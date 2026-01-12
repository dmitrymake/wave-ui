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
    let viewName = route;

    // --- FIX: Принудительное маппинг URL -> View Name ---
    if (route === "artist") viewName = "albums_by_artist";
    if (route === "album") viewName = "tracks_by_album";
    if (route === "playlist") viewName = "details";
    if (route === "favorites") viewName = "details";
    // ----------------------------------------------------

    if (!data) {
      if (route === "album" && parts.length >= 2) {
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
      } else if (route === "yandex_playlist" && parts.length >= 3) {
        data = { uid: parts[1], kind: parts[2], title: "Playlist" };
      } else if (route === "yandex_album_details" && parts.length >= 2) {
        data = { id: parts[1], title: "Album" };
      } else if (route === "yandex_artist_details" && parts.length >= 2) {
        data = { id: parts[1], title: "Artist" };
      } else if (route === "yandex_search" && parts.length >= 2) {
        data = { query: parts[1] };
      } else if (parts.length >= 2) {
        data = { name: parts[1], displayName: parts[1] };
      }
    }

    console.log(`[Router] Navigating: ${route} -> ${viewName}`, data);

    switch (true) {
      case route.startsWith("yandex"):
        activeMenuTab.set("yandex");
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
        navigationStack.set([{ view: "root" }]);
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

    if (route === "yandex") {
      if (get(navigationStack).length > 1) {
        const current = get(navigationStack);
        if (current[0].view !== "root") navigationStack.set([{ view: "root" }]);
      } else {
        navigationStack.set([{ view: "root" }]);
      }
    } else {
      // FIX: Предотвращение дублирования навигации
      const stack = get(navigationStack);
      const currentTop = stack[stack.length - 1];

      const isSameView = currentTop.view === viewName;
      let isSameData = false;

      if (data && currentTop.data) {
        if (
          data.name === currentTop.data.name &&
          data.uid === currentTop.data.uid
        ) {
          isSameData = true;
        }
      } else if (!data && !currentTop.data) {
        isSameData = true;
      }

      if (isSameView && isSameData) {
        return;
      }

      if (data) {
        navigationStack.set([{ view: "root" }, { view: viewName, data: data }]);
      }
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
    } else if (view === "yandex_playlist") {
      newPath = `yandex_playlist/${data.uid}/${data.kind}`;
    } else if (view === "yandex_album_details") {
      newPath = `yandex_album_details/${data.id}`;
    } else if (view === "yandex_artist_details") {
      newPath = `yandex_artist_details/${data.id}`;
    } else if (view === "yandex_search") {
      newPath = `yandex_search/${encodeURIComponent(data.query)}`;
    }

    if (newPath) {
      const nextHash = `#/${newPath}`;
      if (
        (view === "yandex_search" || view === "search") &&
        decodeURIComponent(window.location.hash) !==
          decodeURIComponent(nextHash)
      ) {
        window.history.replaceState(null, "", nextHash);
      } else if (
        decodeURIComponent(window.location.hash) !==
        decodeURIComponent(nextHash)
      ) {
        window.location.hash = `/${newPath}`;
      }
    }
  },
};
