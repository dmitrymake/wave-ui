<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { db } from "../../lib/db";
  import TrackRow from "../TrackRow.svelte";
  import ImageLoader from "../ImageLoader.svelte";
  import MediaCard from "../MediaCard.svelte";
  import { playTrackOptimistic } from "../../lib/playerActions";
  import { ICONS } from "../../lib/icons";
  import { navigateTo, getTrackThumbUrl, searchQuery } from "../../lib/store";
  import SearchBar from "../ui/SearchBar.svelte";
  import { formatQuality } from "../../lib/quality";
  import BaseList from "./BaseList.svelte";
  import type { Track, SearchAlbumResult } from "../../lib/types";

  // Local store for search results
  const tracksStore = writable<Track[]>([]);

  let foundAlbums: SearchAlbumResult[] = [];
  let isSearching = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let hasSearched = false;
  let searchSeq = 0;

  onMount(() => {
    if ($searchQuery.length >= 2) {
      performSearch($searchQuery);
    }
  });

  function handleInput() {
    // The shared SearchBar keeps $searchQuery in sync via bind:value;
    // here only the debounce runs.
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch($searchQuery);
    }, 300);
  }

  function clearInput() {
    searchQuery.set("");
    tracksStore.set([]);
    foundAlbums = [];
    hasSearched = false;
  }

  async function performSearch(q: string) {
    const term = q.trim().toLowerCase();

    if (term.length < 2) {
      tracksStore.set([]);
      foundAlbums = [];
      hasSearched = false;
      return;
    }

    const seq = ++searchSeq;
    isSearching = true;
    hasSearched = true;

    try {
      const results = await db.search(term);
      // Bail if a newer search has started while this one was in flight.
      if (seq !== searchSeq) return;
      const tracksWithIds = results.map((t, i) => ({
        ...t,
        _uid: t.file ? `${t.file}-${i}` : `search-${i}`,
      }));

      tracksStore.set(tracksWithIds);

      const albumMap = new Map();
      results.forEach((track) => {
        const albumName = track.album;
        if (albumName && !albumMap.has(albumName)) {
          const matchAlbum = albumName.toLowerCase().includes(term);
          const matchArtist =
            track.artist && track.artist.toLowerCase().includes(term);

          if (matchAlbum || matchArtist) {
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
      if (seq === searchSeq) isSearching = false;
    }
  }

  function playTrack(track: Track) {
    playTrackOptimistic(track);
  }

  function goToAlbum(album: SearchAlbumResult) {
    navigateTo("tracks_by_album", { name: album.name, artist: album.artist });
  }

  function handleHorizontalScroll(e: WheelEvent) {
    if (e.deltaY !== 0) {
      (e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
    }
  }
</script>

<div class="view-container">
  <div class="content-padded no-bottom-pad">
    <div class="search-field">
      <SearchBar
        bind:value={$searchQuery}
        placeholder="Artists, songs, or albums"
        ariaLabel="Search your library"
        oninput={handleInput}
        onClear={clearInput}
        busy={isSearching}
        autofocus
      />
    </div>
  </div>

  <BaseList
    itemsStore={tracksStore}
    isEditMode={false}
    isLoading={isSearching}
    emptyText=""
  >
    {#snippet header()}
      <div class="content-padded">
        {#if $searchQuery.length < 2}
          <!-- The app's search glyph, not a colour emoji: 🔍 rendered as a 60px
               platform picture (a blue Apple loupe, a Noto one on Linux) in a
               product that draws every other icon as a 1.5px line. -->
          <div class="placeholder-state">
            <div class="placeholder-icon" aria-hidden="true">{@html ICONS.SEARCH}</div>
            <p>Type to search your library</p>
          </div>
        {:else if !isSearching && $tracksStore.length === 0 && foundAlbums.length === 0 && hasSearched}
          <div class="empty-text">No results found for “{$searchQuery}”</div>
        {:else}
          {#if foundAlbums.length > 0}
            <div class="header-label section-spacing">Albums</div>

            <div
              class="music-grid horizontal section-mb"
              onwheel={handleHorizontalScroll}
            >
              {#each foundAlbums as album (album._uid)}
                <MediaCard title={album.name} onactivate={() => goToAlbum(album)}>
                  {#snippet cover()}
                    <ImageLoader
                      src={getTrackThumbUrl(album, "md")}
                      alt={album.name}
                      radius="var(--radius-md)"
                    >
                      {#snippet fallback()}
                        <div class="icon-fallback">{@html ICONS.ALBUMS}</div>
                      {/snippet}
                    </ImageLoader>
                  {/snippet}
                  {#snippet sub()}
                    <div class="card-sub" title={album.artist}>{album.artist}</div>
                  {/snippet}
                  {#snippet meta()}
                    <!-- The library card's facts line, not two header chips: these
                         were .meta-tag, 21px tall, which cut the artist to "Geo…". -->
                    {#if album.year && String(album.year) !== "0"}<span class="meta-item">{album.year}</span>{/if}
                    {#if album.qualityBadge}<span class="meta-item">{formatQuality(album.qualityBadge, "short")}</span>{/if}
                  {/snippet}
                </MediaCard>
              {/each}
            </div>
          {/if}

          {#if $tracksStore.length > 0}
            <div class="header-label">Tracks</div>
          {/if}
        {/if}
      </div>
    {/snippet}

    {#snippet row({ item, index })}
      <TrackRow
        track={item}
        {index}
        isEditable={false}
        onplay={() => playTrack(item)}
      />
    {/snippet}
  </BaseList>
</div>

<style>
  .search-field {
    margin-bottom: var(--space-6);
  }


  .placeholder-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    height: 40vh;
    color: var(--c-text-secondary);
    text-align: center;
  }
  .placeholder-state p {
    margin: var(--space-0);
    font-size: var(--text-base);
    text-wrap: pretty;
  }

  /* The emblem size, the same glyph the search field and the sidebar use. */
  .placeholder-icon {
    display: flex;
    width: var(--icon-size-xl);
    height: var(--icon-size-xl);
    color: var(--c-icon-faint);
  }
  .placeholder-icon :global(svg) {
    width: 100%;
    height: 100%;
    stroke-width: var(--icon-stroke-width);
  }
</style>
