<script>
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { db } from "../../lib/db";
  import TrackRow from "../TrackRow.svelte";
  import ImageLoader from "../ImageLoader.svelte";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";
  import {
    navigateTo,
    getTrackCoverUrl,
    getTrackThumbUrl,
    searchQuery,
  } from "../../lib/store";
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
            // Логика обрезки года до 4 символов
            let yStr = String(track.year || "");
            if (yStr.length > 4) yStr = yStr.substring(0, 4);

            albumMap.set(albumName, {
              name: albumName,
              artist: track.artist,
              file: track.file,
              thumbHash: track.thumbHash,
              _uid: `alb-${albumName}`,
              year: yStr,
              qualityBadge: track.qualityBadge,
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
    if (e.deltaY !== 0) {
      // Блокируем вертикальный скролл страницы, если нужно (опционально)
      // e.preventDefault();
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
            class="music-grid horizontal section-mb"
            on:wheel={handleHorizontalScroll}
          >
            {#each foundAlbums as album (album._uid)}
              <div class="music-card" on:click={() => goToAlbum(album)}>
                <div class="card-img-container">
                  <ImageLoader
                    src={getTrackThumbUrl(album, "md")}
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

                <div class="card-sub-row">
                  <div class="card-sub text-ellipsis">{album.artist}</div>

                  {#if album.year && album.year !== "0" && album.year !== 0}
                    <div class="card-year">{album.year}</div>
                  {/if}

                  {#if album.qualityBadge}
                    <div class="card-year quality">
                      {album.qualityBadge.split(" ")[0]}
                    </div>
                  {/if}
                </div>
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

  .music-grid.horizontal {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;

    scrollbar-width: none;
    -ms-overflow-style: none;

    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }

  .music-grid.horizontal::-webkit-scrollbar {
    display: none;
  }

  .music-grid.horizontal .music-card {
    flex: 0 0 auto;
    width: 210px;
    scroll-snap-align: start;
    margin: 0;
  }

  @media (max-width: 768px) {
    .music-grid.horizontal .music-card {
    }
  }

  /* --- Стили для бейджей (год, качество) --- */

  .card-sub-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    font-size: 13px;
    color: var(--c-text-secondary);
    margin-top: 2px;
    min-width: 0;
  }

  .card-sub {
    flex-shrink: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-year {
    font-size: 10px;
    font-weight: 700;
    color: var(--c-text-muted);
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    line-height: 1;
  }

  .card-year.quality {
    color: var(--c-text-secondary);
    border: 1px solid var(--c-border);
    background: transparent;
  }
</style>
