<script>
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { db } from "../../lib/db";
  import TrackRow from "../TrackRow.svelte";
  import ImageLoader from "../ImageLoader.svelte";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";
  import { navigateTo, getTrackCoverUrl, searchQuery } from "../../lib/store";
  import BaseList from "./BaseList.svelte";

  // Local store for search results
  const tracksStore = writable([]);

  let foundAlbums = [];
  let isSearching = false;
  let debounceTimer;
  let hasSearched = false;

  onMount(() => {
    if ($searchQuery.length >= 2) {
      performSearch($searchQuery);
    }
  });

  function handleInput(e) {
    searchQuery.set(e.target.value);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch($searchQuery);
    }, 300);
  }

  async function performSearch(q) {
    const term = q.trim().toLowerCase();

    if (term.length < 2) {
      tracksStore.set([]);
      foundAlbums = [];
      hasSearched = false;
      return;
    }

    isSearching = true;
    hasSearched = true;

    try {
      // 1. Search tracks
      const results = await db.search(term);

      // Add unique IDs for BaseList
      const tracksWithIds = results.map((t, i) => ({
        ...t,
        _uid: t.file ? `${t.file}-${i}` : `search-${i}`,
      }));

      tracksStore.set(tracksWithIds);

      // 2. Extract albums
      const albumMap = new Map();
      results.forEach((track) => {
        const albumName = track.album;
        if (albumName && !albumMap.has(albumName)) {
          const matchAlbum = albumName.toLowerCase().includes(term);
          const matchArtist =
            track.artist && track.artist.toLowerCase().includes(term);

          if (matchAlbum || matchArtist) {
            albumMap.set(albumName, {
              name: albumName,
              artist: track.artist,
              file: track.file,
              _uid: `alb-${albumName}`,
            });
          }
        }
      });
      foundAlbums = Array.from(albumMap.values());
    } finally {
      isSearching = false;
    }
  }

  function playTrack(track) {
    MPD.playTrackOptimistic(track);
  }

  function goToAlbum(album) {
    navigateTo("tracks_by_album", album);
  }

  // Функция для прокрутки горизонтального списка колесиком мыши
  function handleHorizontalScroll(e) {
    // Если скроллим колесиком (deltaY), превращаем это в горизонтальный скролл
    if (e.deltaY !== 0) {
      // currentTarget указывает на div.albums-scroller
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }
</script>

<div class="view-container">
  <div class="content-padded no-bottom-pad">
    <div class="search-input-container">
      <span class="search-icon">{@html ICONS.SEARCH}</span>
      <input
        type="text"
        placeholder="Artists, songs, or albums"
        value={$searchQuery}
        on:input={handleInput}
        autoFocus
      />
      {#if isSearching}
        <div class="spinner"></div>
      {/if}
    </div>
  </div>

  <BaseList
    itemsStore={tracksStore}
    isEditMode={false}
    isLoading={false}
    emptyText=""
  >
    <div slot="header" class="content-padded">
      {#if $searchQuery.length < 2}
        <div class="placeholder-state">
          <div class="placeholder-icon">🔍</div>
          <p>Type to search your library</p>
        </div>
      {:else if !isSearching && $tracksStore.length === 0 && foundAlbums.length === 0 && hasSearched}
        <div class="empty-text">No results found for "{$searchQuery}"</div>
      {:else}
        {#if foundAlbums.length > 0}
          <div class="header-label section-spacing">Albums</div>

          <div
            class="albums-scroller section-mb"
            on:wheel={handleHorizontalScroll}
          >
            {#each foundAlbums as album (album._uid)}
              <div class="music-card" on:click={() => goToAlbum(album)}>
                <div class="card-img-container">
                  <ImageLoader
                    src={getTrackCoverUrl(album)}
                    alt={album.name}
                    radius="var(--radius-md)"
                  >
                    <div slot="fallback" class="icon-fallback">💿</div>
                  </ImageLoader>

                  <div class="play-overlay">
                    <span class="play-icon-wrap">{@html ICONS.PLAY}</span>
                  </div>
                </div>

                <div class="card-title" title={album.name}>{album.name}</div>
                <div class="card-sub">{album.artist}</div>
              </div>
            {/each}
          </div>
        {/if}

        {#if $tracksStore.length > 0}
          <div class="header-label">Tracks</div>
        {/if}
      {/if}
    </div>

    <div slot="row" let:item let:index>
      <TrackRow
        track={item}
        {index}
        isEditable={false}
        on:play={() => playTrack(item)}
      />
    </div>
  </BaseList>
</div>

<style>
  @import "./MusicViews.css";

  .no-bottom-pad {
    padding-bottom: 0;
  }

  .section-spacing {
    margin-top: 10px;
  }

  .section-mb {
    margin-bottom: 24px;
  }

  .play-icon-wrap {
    width: 40px;
    color: var(--c-text-primary);
  }

  .empty-text {
    text-align: center;
    color: var(--c-text-secondary);
    margin-top: 50px;
  }

  .placeholder-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 40vh;
    color: var(--c-text-secondary);
  }

  .placeholder-icon {
    font-size: 60px;
    margin-bottom: 20px;
    color: var(--c-icon-faint);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--c-border);
    border-top-color: var(--c-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-left: 8px;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* =========================================
     ГОРИЗОНТАЛЬНЫЙ СКРОЛЛЕР АЛЬБОМОВ
     ========================================= */
  .albums-scroller {
    display: flex; /* Выстраиваем в ряд */
    overflow-x: auto; /* Разрешаем скролл */
    gap: 16px; /* Расстояние между карточками */
    padding-bottom: 8px; /* Место для тени снизу, если нужно */

    /* Скрытие скроллбара */
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE */

    /* Физика скролла для мобилок */
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory; /* "Прилипание" карточек */
  }

  /* Скрытие скроллбара для Chrome/Safari */
  .albums-scroller::-webkit-scrollbar {
    display: none;
  }

  /* Специфичные стили для карточек внутри скроллера */
  .albums-scroller .music-card {
    flex: 0 0 auto; /* Карточки не сжимаются */
    width: 160px; /* Фиксированная ширина */
    scroll-snap-align: start; /* Точка прилипания */
    margin: 0;
  }

  /* Адаптация размера карточек для мобильных устройств */
  @media (max-width: 768px) {
    .albums-scroller .music-card {
      width: 140px;
    }
  }
</style>
