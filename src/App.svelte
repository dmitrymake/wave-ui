<script>
  import { onMount } from "svelte";
  import MainScreen from "./components/MainScreen.svelte";
  import ContextMenu from "./components/ContextMenu.svelte";
  import Modal from "./components/Modal.svelte";
  import * as MPD from "./lib/mpd";
  import { ApiActions } from "./lib/api";
  import { db } from "./lib/db";
  import { Router } from "./lib/router";
  import {
    setNavigationCallback,
    showToast,
    isYandexEnabled,
  } from "./lib/store";
  import "./styles/shared.css";
  import { get } from "svelte/store";

  onMount(async () => {
    Router.init();
    setNavigationCallback((view, data) => {
      Router.updateUrl(view, data);
    });

    MPD.connect();
    ApiActions.loadRadioStations();

    if (get(isYandexEnabled)) {
      await ApiActions.checkYandexAuth();
      ApiActions.syncYandexFavorites();
    }

    try {
      const artists = await db.getArtists();
      if (artists.length > 0) {
        console.log(
          `[App] Database ready. Loaded ${artists.length} artists from cache.`,
        );
      } else {
        console.log("[App] Database empty. Starting initial sync...");
        ApiActions.syncLibrary();
      }
    } catch (e) {
      console.error("[App] DB Check failed:", e);
      showToast("Local DB error. Please update library manually.", "error");
    }
  });
</script>

<MainScreen />
<ContextMenu />
<Modal />
