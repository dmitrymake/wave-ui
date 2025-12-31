<script>
  import { onMount } from "svelte";
  import {
    playlists,
    isLoadingPlaylists,
    activePlaylistTracks,
    isLoadingTracks,
    navigationStack,
    navigateTo,
  } from "../../lib/store";
  import Skeleton from "../Skeleton.svelte";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";

  let isEditMode = false;
  let pressedPlayAll = false;
  let pressedAddToQueue = false;
  let playlistDuration = "";
  let playlistQuality = "";

  $: currentView = $navigationStack[$navigationStack.length - 1];
  $: isDetailsView = currentView.view === "details";

  $: if (currentView) {
    pressedPlayAll = false;
    pressedAddToQueue = false;
  }

  $: if (isDetailsView && $activePlaylistTracks.length > 0) {
    const tracks = $activePlaylistTracks;
    if (!tracks[0]._uid) {
      const styledTracks = tracks.map((t) => ({ ...t, _uid: Math.random() }));
      activePlaylistTracks.set(styledTracks);
    }
    calculateMeta(tracks);
  } else if (
    isDetailsView &&
    $activePlaylistTracks.length === 0 &&
    !$isLoadingTracks
  ) {
    playlistDuration = "0 min";
    playlistQuality = "";
  }

  $: if (isDetailsView && currentView.data) {
    isEditMode = false;
    MPD.openPlaylistDetails(currentView.data.name);
  }

  onMount(() => {
    if (!isDetailsView && $playlists.length === 0) {
      MPD.loadPlaylists();
    }
  });

  function calculateMeta(tracks) {
    const totalSec = tracks.reduce(
      (acc, t) => acc + (parseFloat(t.time) || 0),
      0,
    );
    if (totalSec > 0) {
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      playlistDuration = h > 0 ? `${h} hr ${m} min` : `${m} min`;
    } else {
      playlistDuration = "";
    }

    const formats = new Set();
    tracks.forEach((t) => {
      if (t.qualityBadge) formats.add(t.qualityBadge.split(" ")[0]);
    });
    playlistQuality =
      formats.size === 1
        ? tracks[0].qualityBadge
        : formats.size > 1
          ? "Mixed"
          : "";
  }

  function openPlaylist(playlist) {
    navigateTo("details", playlist);
  }
  function handleHeaderPlayAll() {
    pressedPlayAll = true;
    MPD.playPlaylistContext(currentView.data.name, 0);
  }
  function playTrack(index) {
    if (!isEditMode) MPD.playPlaylistContext(currentView.data.name, index);
  }
  function addToQueue() {
    if ($activePlaylistTracks.length > 0) {
      const safeName = currentView.data.name.replace(/"/g, '\\"');
      MPD.runMpdRequest(`load "${safeName}"`);
      pressedAddToQueue = true;
      setTimeout(() => {
        pressedAddToQueue = false;
      }, 2000);
    }
  }
  function toggleEditMode() {
    isEditMode = !isEditMode;
  }
  function handleRemoveTrack(index) {
    const playlistName = currentView.data.name;
    const tracks = $activePlaylistTracks;
    tracks.splice(index, 1);
    activePlaylistTracks.set(tracks);
    MPD.removeFromPlaylist(playlistName, index);
    calculateMeta(tracks);
  }
  function handleMoveTrack(fromIndex, toIndex) {
    MPD.movePlaylistTrack(currentView.data.name, fromIndex, toIndex);
  }
  $: isFavPlaylist = currentView?.data?.name === "Favorites";
</script>

<div class="view-container" class:scrollable={!isDetailsView}>
  {#if isDetailsView}
    <BaseList
      itemsStore={activePlaylistTracks}
      isLoading={$isLoadingTracks}
      {isEditMode}
      emptyText="This playlist is empty."
      onMoveItem={handleMoveTrack}
    >
      <div slot="header" class="content-padded">
        <div class="view-header">
          <div
            class="header-art"
            style="background: {isFavPlaylist
              ? 'linear-gradient(135deg, hsl(348, 95%, 58%), hsl(348, 90%, 40%))'
              : currentView.data.color || '#333'};"
          >
            <div class="header-icon-wrap">
              {@html isFavPlaylist ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
            </div>
          </div>

          <div class="header-info">
            <div class="header-text-group">
              <div class="header-label">Playlist</div>
              <h1 class="header-title" title={currentView.data.name}>
                {currentView.data.name}
              </h1>

              <div class="meta-badges">
                {#if $isLoadingTracks}
                  <span class="meta-tag">Loading...</span>
                {:else}
                  <span class="meta-tag"
                    >{$activePlaylistTracks.length} tracks</span
                  >
                  {#if playlistDuration}<span class="meta-tag"
                      >{playlistDuration}</span
                    >{/if}
                  {#if playlistQuality}<span class="meta-tag quality"
                      >{playlistQuality}</span
                    >{/if}
                {/if}
              </div>
            </div>

            <div class="header-actions">
              <button
                class="btn-primary"
                on:click={handleHeaderPlayAll}
                disabled={pressedPlayAll}
              >
                {pressedPlayAll ? "Playing..." : "Play All"}
              </button>
              <button
                class="btn-secondary"
                on:click={addToQueue}
                disabled={pressedAddToQueue}
              >
                {pressedAddToQueue ? "Added" : "To Queue"}
              </button>
              <button
                class="btn-action"
                class:active={isEditMode}
                title="Edit"
                on:click={toggleEditMode}
              >
                {@html isEditMode ? ICONS.ACCEPT : ICONS.EDIT}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div slot="row" let:item let:index let:startDrag>
        <TrackRow
          track={item}
          {index}
          isEditable={isEditMode}
          on:play={() => playTrack(index)}
          on:remove={() => handleRemoveTrack(index)}
          on:startdrag={startDrag}
        />
      </div>
    </BaseList>
  {:else if $isLoadingPlaylists}
    <div class="content-padded">
      <div class="music-grid">
        {#each Array(8) as _}
          <div class="music-card">
            <Skeleton
              width="100%"
              style="aspect-ratio: 1; border-radius: 12px; margin-bottom: 12px;"
            />
            <Skeleton width="60%" height="16px" />
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="content-padded">
      <div class="music-grid">
        <div class="music-card">
          <div class="card-img-container dashed-cover">
            <div class="icon-wrap">{@html ICONS.ADD}</div>
          </div>
          <div class="card-title">New Playlist</div>
        </div>
        {#each $playlists as playlist}
          {@const isFav = playlist.name === "Favorites"}
          <div class="music-card" on:click={() => openPlaylist(playlist)}>
            <div
              class="card-img-container"
              style="background: {playlist.color};"
            >
              <div class="icon-wrap">
                {@html isFav ? ICONS.HEART_FILLED : ICONS.PLAYLISTS}
              </div>
              <div class="play-overlay">
                <span class="overlay-icon">{@html ICONS.PLAY}</span>
              </div>
            </div>
            <div class="card-title">{playlist.name}</div>
            <div class="card-sub">
              {playlist.lastModified
                ? new Date(playlist.lastModified).toLocaleDateString()
                : "Playlist"}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  @import "./MusicViews.css";

  .view-header {
    display: flex;
    gap: 24px;
    width: 100%;
    /* КЛЮЧЕВОЙ МОМЕНТ: Растягиваем высоту инфо-блока по высоте картинки */
    align-items: stretch;
  }

  .header-art {
    /* Фиксируем размер картинки, чтобы она не сплющивалась */
    /* aspect-ratio заменяет height: 220px */
    aspect-ratio: 1;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .header-info {
    display: flex;
    flex-direction: column;
    /* КЛЮЧЕВОЙ МОМЕНТ: Расталкиваем верхнюю и нижнюю часть */
    justify-content: space-between;
    flex: 1;
    min-width: 0;
  }

  /* Группируем заголовок и бейджи, чтобы они всегда были вместе сверху */
  .header-text-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap; /* Разрешаем перенос, если не влезают */
  }

  /* Запрещаем ломать слова внутри кнопок */
  .header-actions button {
    white-space: nowrap;
  }

  .header-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--c-accent);
    margin-bottom: 4px;
  }

  .header-icon-wrap {
    width: 64px;
    height: 64px;
    color: #fff;
  }
  .header-icon-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }

  /* --- Стили для списка плейлистов (Grid) --- */
  .card-img-container {
    display: grid !important;
    place-items: center;
    position: relative;
  }
  .icon-wrap {
    width: 30%;
    height: 30%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.9);
  }
  .icon-wrap :global(svg) {
    width: 100%;
    height: 100%;
  }
  .overlay-icon {
    width: 48px;
    color: #fff;
  }

  @media (max-width: 1000px) {
    .view-header {
      /* Перестраиваем в колонку: Картинка сверху, всё остальное снизу */
      flex-direction: column;
      align-items: center; /* Центрируем всё */
      height: auto; /* Сбрасываем привязку к высоте */
    }

    .header-info {
      width: 100%;
      align-items: center; /* Центрируем текст на мобиле */
      justify-content: flex-start;
    }

    .header-text-group {
      align-items: center; /* Центрируем лейблы и тайтл */
      text-align: center;
    }

    .header-actions {
      justify-content: center; /* Кнопки по центру */
      width: 100%;
      margin-top: 12px;
    }
  }
</style>
