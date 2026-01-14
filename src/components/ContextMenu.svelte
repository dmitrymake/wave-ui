<script>
  import { fade, scale } from "svelte/transition";
  import {
    contextMenu,
    closeContextMenu,
    navigateTo,
    favorites,
    playlists,
    showToast,
    activePlaylistTracks,
    showModal,
    ignoreNextPopState,
  } from "../lib/store";
  import { ICONS } from "../lib/icons";
  import { PlayerActions } from "../lib/mpd/player";
  import { LibraryActions } from "../lib/mpd/library";
  import { mpdClient } from "../lib/mpd/client";
  import { YandexApi } from "../lib/yandex";

  let innerWidth;
  let innerHeight;
  let menuEl;
  let menuHeight = 0;
  let menuWidth = 0;

  let view = "main";
  let historyPushed = false;

  $: if ($contextMenu.isOpen) {
    view = "main";
  }

  $: if ($contextMenu.isOpen) {
    if (!historyPushed && typeof history !== "undefined") {
      history.pushState({ contextMenuOpen: true }, "");
      historyPushed = true;
    }
  } else {
    if (historyPushed && typeof history !== "undefined") {
      ignoreNextPopState.set(true);
      history.back();
      historyPushed = false;
    }
  }

  function handlePopState(event) {
    if ($contextMenu.isOpen) {
      historyPushed = false;
      closeContextMenu();
    }
  }

  function handleBackdropClick() {
    closeContextMenu();
  }

  function handlePlayNext() {
    if ($contextMenu.track) PlayerActions.playNext($contextMenu.track.file);
    closeContextMenu();
  }

  function handleAddToQueue() {
    if ($contextMenu.track) PlayerActions.addToQueue($contextMenu.track.file);
    closeContextMenu();
  }

  function handleToggleLike() {
    if ($contextMenu.track) LibraryActions.toggleFavorite($contextMenu.track);
    closeContextMenu();
  }

  function handleGoToAlbum() {
    const t = $contextMenu.track;
    if (t && t.album) {
      if (!t.isYandex) {
        navigateTo("tracks_by_album", { name: t.album, artist: t.artist });
      }
    }
    closeContextMenu();
  }

  function handleGoToArtist() {
    const t = $contextMenu.track;
    if (t && t.artist) {
      if (!t.isYandex) {
        navigateTo("albums_by_artist", { name: t.artist });
      }
    }
    closeContextMenu();
  }

  async function handleRemoveFromPlaylist() {
    const { playlistName, index } = $contextMenu.context;
    if (playlistName && index !== null) {
      activePlaylistTracks.update((tracks) => {
        const copy = [...tracks];
        copy.splice(index, 1);
        return copy;
      });
      await LibraryActions.removeFromPlaylist(playlistName, index);
    }
    closeContextMenu();
  }

  function handleRemoveFromQueue() {
    const { index } = $contextMenu.context;
    if (index !== null && index !== undefined) {
      PlayerActions.removeFromQueue(index);
    }
    closeContextMenu();
  }

  function handlePlaylistPlay() {
    const pl = $contextMenu.context.playlist;
    if (pl) {
      mpdClient
        .send("stop")
        .then(() => mpdClient.send("clear"))
        .then(() => mpdClient.send(`load "${pl.name.replace(/"/g, '\\"')}"`))
        .then(() => mpdClient.send("play 0"));
    }
    closeContextMenu();
  }

  function handlePlaylistRename() {
    const pl = $contextMenu.context.playlist;
    if (!pl) return;
    closeContextMenu();

    showModal({
      title: "Rename Playlist",
      message: `Enter new name for "${pl.name}":`,
      type: "prompt",
      placeholder: pl.name,
      inputValue: pl.name,
      confirmLabel: "Rename",
      onConfirm: (newName) => {
        if (newName && newName !== pl.name) {
          LibraryActions.renamePlaylist(pl.name, newName);
        }
      },
    });
  }

  function handlePlaylistDelete() {
    const pl = $contextMenu.context.playlist;
    if (!pl) return;
    closeContextMenu();

    showModal({
      title: "Delete Playlist",
      message: `Are you sure you want to delete "${pl.name}"? This cannot be undone.`,
      type: "confirm",
      confirmLabel: "Delete",
      onConfirm: () => {
        LibraryActions.deletePlaylist(pl.name);
      },
    });
  }

  async function handleRadioByTrack() {
    const t = $contextMenu.track;
    if (t && t.isYandex && t.id) {
      showToast(`Starting radio based on "${t.title}"...`, "info");
      try {
        await YandexApi.playRadio(t.id, "track");
      } catch (e) {
        console.error(e);
        showToast("Error starting radio", "error");
      }
    }
    closeContextMenu();
  }

  async function handleRadioByArtist() {
    const t = $contextMenu.track;
    if (t && t.isYandex && t.artist) {
      showToast(`Searching artist "${t.artist}"...`, "info");
      try {
        // First search for the artist to get ID
        const searchRes = await YandexApi.search(t.artist);
        if (searchRes && searchRes.artists && searchRes.artists.length > 0) {
          const artistId = searchRes.artists[0].id;
          showToast(
            `Starting Vibe for ${searchRes.artists[0].title}...`,
            "info",
          );
          await YandexApi.playRadio(artistId, "artist");
        } else {
          showToast("Artist not found for Vibe", "error");
        }
      } catch (e) {
        showToast("Failed to start Artist Vibe", "error");
      }
    }
    closeContextMenu();
  }

  function showPlaylists() {
    view = "playlists";
  }

  function backToMain() {
    view = "main";
  }

  async function addToPlaylist(playlistName) {
    const track = $contextMenu.track;
    if (!track) return;
    try {
      const safePl = playlistName.replace(/"/g, '\\"');
      const safeFile = track.file.replace(/"/g, '\\"');
      await mpdClient.send(`playlistadd "${safePl}" "${safeFile}"`);
      showToast(`Added to "${playlistName}"`, "success");
      closeContextMenu();
    } catch (e) {
      console.error(e);
      showToast("Failed to add", "error");
    }
  }

  $: isLiked = $contextMenu.track && $favorites.has($contextMenu.track.file);
  $: isRadio =
    $contextMenu.track &&
    (String($contextMenu.track.file).includes("http") ||
      String($contextMenu.track.file).includes("://"));

  $: isYandexTrack =
    $contextMenu.track &&
    ($contextMenu.track.isYandex || $contextMenu.track.service === "yandex");

  $: isPlaylistContext = $contextMenu.context?.type === "playlist";
  $: isQueueContext = $contextMenu.context?.type === "queue";
  $: isPlaylistCard = $contextMenu.context?.type === "playlist-card";
  $: isMiniPlayerSource = $contextMenu.context?.source === "miniplayer";

  $: stylePosition = (() => {
    if (!$contextMenu.isOpen) return "";

    const rect = $contextMenu.triggerRect;
    const clickX = $contextMenu.x;
    const clickY = $contextMenu.y;

    const mw = menuWidth || 220;
    const mh = menuHeight || 320;

    if (innerWidth <= 768 && isMiniPlayerSource && rect) {
      const bottomPos = innerHeight - rect.top;
      return `
        position: fixed; 
        bottom: ${bottomPos}px; 
        left: 50%; 
        transform: translateX(-50%); 
        margin: 0; 
        transform-origin: bottom center;
      `;
    }

    let left = 0;
    let top = 0;
    let transformOrigin = "top left";

    if (rect) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const isRightHalf = centerX > innerWidth / 2;
      const isBottomHalf = centerY > innerHeight / 2;

      if (isRightHalf) {
        left = rect.right - mw;
        transformOrigin = isBottomHalf ? "bottom right" : "top right";
      } else {
        left = rect.left;
        transformOrigin = isBottomHalf ? "bottom left" : "top left";
      }

      if (isBottomHalf) {
        top = rect.top - mh;
      } else {
        top = rect.bottom;
      }
    } else {
      left = clickX;
      top = clickY;
      if (left + mw > innerWidth) left = innerWidth - mw - 10;
      if (top + mh > innerHeight) top = innerHeight - mh - 10;
    }

    const padding = 8;
    if (left < padding) left = padding;
    if (left + mw > innerWidth - padding) left = innerWidth - mw - padding;
    if (top < padding) top = padding;
    if (top + mh > innerHeight - padding) top = innerHeight - mh - padding;

    return `position: fixed; top: ${top}px; left: ${left}px; margin: 0; transform-origin: ${transformOrigin};`;
  })();
</script>

<svelte:window bind:innerWidth bind:innerHeight on:popstate={handlePopState} />

{#if $contextMenu.isOpen}
  <div
    class="backdrop"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 100 }}
  >
    <div
      class="menu-card"
      bind:this={menuEl}
      bind:clientHeight={menuHeight}
      bind:clientWidth={menuWidth}
      style={stylePosition}
      transition:scale={{ start: 0.95, duration: 100 }}
      on:click|stopPropagation
    >
      <div class="menu-header">
        {#if view === "playlists"}
          <button class="back-btn-area" on:click={backToMain}>
            <span class="back-icon">{@html ICONS.BACK}</span>
          </button>
          <span class="header-title">Select Playlist</span>
        {:else if isPlaylistCard}
          <div class="track-info">
            <div class="title text-ellipsis">
              {$contextMenu.context.playlist.name}
            </div>
            <div class="artist text-ellipsis">Playlist</div>
          </div>
        {:else}
          <div class="track-info">
            <div class="title text-ellipsis">{$contextMenu.track.title}</div>
            <div class="artist text-ellipsis">{$contextMenu.track.artist}</div>
          </div>
        {/if}
      </div>

      <div class="menu-items scroll-y">
        {#if view === "playlists"}
          {#each $playlists as pl}
            {#if pl.name !== "Favorites"}
              <button class="menu-row" on:click={() => addToPlaylist(pl.name)}>
                <span class="icon">{@html ICONS.PLAYLISTS}</span>
                <span>{pl.name}</span>
              </button>
            {/if}
          {/each}
          {#if $playlists.filter((p) => p.name !== "Favorites").length === 0}
            <div class="empty-msg">No custom playlists</div>
          {/if}
        {:else if isPlaylistCard}
          <button class="menu-row" on:click={handlePlaylistPlay}>
            <span class="icon">{@html ICONS.PLAY}</span>
            <span>Play Now</span>
          </button>

          <div class="sep"></div>

          <button class="menu-row" on:click={handlePlaylistRename}>
            <span class="icon">{@html ICONS.EDIT}</span>
            <span>Rename</span>
          </button>

          <button class="menu-row" on:click={handlePlaylistDelete}>
            <span class="icon">{@html ICONS.REMOVE}</span>
            <span>Delete Playlist</span>
          </button>
        {:else}
          <button class="menu-row" on:click={handlePlayNext}>
            <span class="icon">{@html ICONS.NEXT}</span>
            <span>Play Next</span>
          </button>

          <button class="menu-row" on:click={handleAddToQueue}>
            <span class="icon">{@html ICONS.MENU}</span>
            <span>Add to Queue</span>
          </button>

          <button class="menu-row" on:click={showPlaylists}>
            <span class="icon">{@html ICONS.ADD_TO_PLAYLIST || ICONS.ADD}</span>
            <span>Add to Playlist...</span>
          </button>

          {#if isYandexTrack}
            <div class="sep"></div>
            <button class="menu-row" on:click={handleRadioByTrack}>
              <span class="icon">{@html ICONS.RADIO}</span>
              <span>Vibe by Track</span>
            </button>
            <button class="menu-row" on:click={handleRadioByArtist}>
              <span class="icon">{@html ICONS.ARTISTS}</span>
              <span>Vibe by Artist</span>
            </button>
          {/if}

          {#if !isRadio && !isYandexTrack}
            <button class="menu-row" on:click={handleGoToAlbum}>
              <span class="icon">{@html ICONS.ALBUM_LINK || ICONS.ALBUMS}</span>
              <span>Go to Album</span>
            </button>

            <button class="menu-row" on:click={handleGoToArtist}>
              <span class="icon"
                >{@html ICONS.ARTIST_LINK || ICONS.ARTISTS}</span
              >
              <span>Go to Artist</span>
            </button>
          {/if}

          <button class="menu-row" on:click={handleToggleLike}>
            <span class="icon" class:liked={isLiked}>
              {@html isLiked ? ICONS.HEART_FILLED : ICONS.HEART}
            </span>
            <span>{isLiked ? "Unlike" : "Like"}</span>
          </button>

          {#if isPlaylistContext}
            <div class="sep"></div>
            <button class="menu-row" on:click={handleRemoveFromPlaylist}>
              <span class="icon">{@html ICONS.REMOVE}</span>
              <span>Remove from Playlist</span>
            </button>
          {/if}

          {#if isQueueContext}
            <div class="sep"></div>
            <button class="menu-row" on:click={handleRemoveFromQueue}>
              <span class="icon">{@html ICONS.REMOVE}</span>
              <span>Remove from Queue</span>
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: transparent;
    backdrop-filter: blur(2px);
  }

  .menu-card {
    background: #1e1e1e;
    width: 220px;
    max-height: 400px;
    border-radius: 12px;
    box-shadow: 0 10px 40px var(--c-black-70);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--c-border);
    z-index: 10001;
  }

  .menu-header {
    padding: 0;
    height: 50px;
    background: var(--c-white-10);
    border-bottom: 1px solid var(--c-border);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .track-info {
    padding: 0 14px;
    overflow: hidden;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
  }

  .title {
    font-size: 13px;
    font-weight: 700;
    color: var(--c-text-primary);
    margin-bottom: 2px;
  }

  .artist {
    font-size: 12px;
    color: var(--c-text-secondary);
  }

  .header-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--c-text-primary);
    padding-right: 14px;
  }

  .back-btn-area {
    background: none;
    border: none;
    color: var(--c-text-primary);
    width: 48px;
    height: 100%;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 4px;
  }
  .back-btn-area:active {
    background: var(--c-white-10);
  }
  .back-icon {
    width: 20px;
    height: 20px;
    display: block;
  }
  .back-icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .menu-items {
    padding: 6px 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .menu-row {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    background: transparent;
    border: none;
    color: var(--c-text-primary);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
    width: 100%;
  }

  .menu-row:active,
  .menu-row:hover {
    background: var(--c-surface-hover);
  }

  .icon {
    width: 20px;
    height: 20px;
    margin-right: 14px;
    color: var(--c-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon.liked {
    color: var(--c-heart);
  }
  .icon.liked :global(svg) {
    stroke: none;
  }

  .sep {
    height: 1px;
    background: var(--c-border);
    margin: 6px 16px;
    opacity: 0.3;
  }

  .empty-msg {
    padding: 16px;
    text-align: center;
    color: var(--c-text-muted);
    font-size: 13px;
  }
</style>
