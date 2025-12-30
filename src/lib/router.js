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
    // "#/album/Name" -> "album/Name"
    let raw = window.location.hash.slice(1);
    while (raw.startsWith("/")) {
      raw = raw.slice(1);
    }

    if (!raw) {
      // Пустой URL -> идем в Artists по умолчанию
      if (get(navigationStack).length > 1 || get(activeMenuTab) === "search") {
        this.setRootTab("artists");
        // Обновляем URL, чтобы он не был пустым
        window.location.hash = "/artists";
      }
      return;
    }

    let route, paramRaw;
    const firstSlashIndex = raw.indexOf("/");
    if (firstSlashIndex === -1) {
      route = raw;
      paramRaw = null;
    } else {
      route = raw.slice(0, firstSlashIndex);
      paramRaw = raw.slice(firstSlashIndex + 1);
    }

    const param = paramRaw ? decodeURIComponent(paramRaw) : null;
    const richData = consumeRouteData();
    const data =
      richData || (param ? { name: param, displayName: param } : null);

    console.log(`[Router] Match: ${route}, Param: ${param}`);

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
      case "favorites":
        activeMenuTab.set("favorites");
        navigationStack.set([
          { view: "root" },
          {
            view: "details",
            data: { name: "Favorites", displayName: "Favorites" },
          },
        ]);
        break;
      // ======================================

      case "artists":
        this.setRootTab("artists");
        break;
      case "albums":
        this.setRootTab("albums");
        break;
      case "search":
        activeMenuTab.set("search");
        if (param) searchQuery.set(param);
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
        console.warn(`[Router] Unknown route: ${route}`);
        // Fallback
        this.setRootTab("artists");
        break;
    }
  },

  // Хелпер для переключения табов
  setRootTab(tab) {
    activeMenuTab.set(tab);
    // Всегда сбрасываем стек в корень при переключении таба
    navigationStack.set([{ view: "root" }]);
  },

  // Формирование URL из действий в приложении
  updateUrl(view, data) {
    let newPath = "";

    if (view === "root") {
      const tab = get(activeMenuTab);
      if (tab === "search") {
        const q = get(searchQuery);
        newPath = q ? `search/${encodeURIComponent(q)}` : "search";
      } else {
        newPath = tab; // artists, albums, radio, queue...
      }
    } else if (view === "details") {
      const name = data.name || data;
      // Если мы открываем Favorites, ставим красивый URL, иначе стандартный playlist/Name
      if (name === "Favorites") {
        newPath = "favorites";
      } else {
        newPath = `playlist/${encodeURIComponent(name)}`;
      }
    } else if (view === "albums_by_artist") {
      const name = data.name || data;
      newPath = `artist/${encodeURIComponent(name)}`;
    } else if (view === "tracks_by_album") {
      const name = data.name || data;
      newPath = `album/${encodeURIComponent(name)}`;
    } else if (view === "queue") {
      newPath = "queue";
    }

    if (newPath) {
      // Меняем хэш. Это триггерит handleHashChange.
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
