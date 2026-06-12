<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount } from "svelte";
  import MainScreen from "./components/MainScreen.svelte";
  import ContextMenu from "./components/ContextMenu.svelte";
  import Modal from "./components/Modal.svelte";
  import * as MPD from "./lib/mpd";
  import { ApiActions } from "./lib/api";
  import { YandexService } from "./lib/yandexService";
  import { db, bumpLibraryRevision } from "./lib/db";
  import { Router } from "./lib/router";
  import {
    setNavigationCallback,
    showToast,
    showModal,
    isSyncingLibrary,
  } from "./lib/store";
  import { isYandexEnabled } from "./lib/stores/yandex";
  import { MSG } from "./lib/messages";
  import { logger } from "./lib/logger";
  import "./styles/shared.css";
  import "./components/views/MusicViews.css";
  import { get } from "svelte/store";

  onMount(async () => {
    Router.init();
    setNavigationCallback((view, data) => {
      Router.updateUrl(view, data);
    });

    MPD.connect();
    ApiActions.loadRadioStations();

    if (get(isYandexEnabled)) {
      await YandexService.checkYandexAuth();
      YandexService.syncYandexFavorites();
    }

    try {
      const artists = await db.getArtists();
      if (artists.length > 0) {
        logger.log(
          `[App] Database ready. Loaded ${artists.length} artists from cache.`,
        );
      } else {
        // Empty either on first run or after the destructive v4 migration cleared
        // the store. Resync and observe the outcome so a failed resync surfaces a
        // retry instead of silently leaving the library blank.
        logger.log("[App] Database empty. Starting initial sync...");
        resyncLibrary();
      }
    } catch (e) {
      logger.error("[App] DB Check failed:", e);
      showToast(MSG.APP_DB_ERROR, "error");
    }
  });

  // Run a library sync and observe its outcome. The sync runs in a worker on a
  // separate IndexedDB connection, so the worker's write does not bump our
  // libraryRevision on its own. We watch isSyncingLibrary fall back to false
  // (DONE or ERROR both clear it), then verify the data actually landed: on
  // success bump libraryRevision so a mounted view refetches; on failure log and
  // offer a retry so the migration can't leave a permanently blank library.
  function resyncLibrary(): void {
    if (get(isSyncingLibrary)) return;

    ApiActions.syncLibrary();

    let started = false;
    const unsubscribe = isSyncingLibrary.subscribe((syncing) => {
      if (syncing) {
        started = true;
        return;
      }
      if (!started) return; // initial false emission before the sync begins
      unsubscribe();
      verifyResync();
    });
  }

  async function verifyResync(): Promise<void> {
    try {
      const artists = await db.getArtists();
      if (artists.length > 0) {
        // The worker wrote on its own connection; signal mounted views to refetch.
        bumpLibraryRevision();
      } else {
        logger.error("[App] Resync left the library empty");
        offerResyncRetry();
      }
    } catch (e) {
      logger.error("[App] Resync verification failed:", e);
      offerResyncRetry();
    }
  }

  function offerResyncRetry(): void {
    showModal({
      title: MSG.SYNC_FAILED,
      message: MSG.APP_DB_ERROR,
      confirmLabel: "Retry",
      type: "confirm",
      onConfirm: () => resyncLibrary(),
    });
  }
</script>

<MainScreen />
<ContextMenu />
<Modal />
