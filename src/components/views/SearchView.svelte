<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { db } from "../../lib/db";
  import TrackRow from "../TrackRow.svelte";
  import ImageLoader from "../ImageLoader.svelte";
  import { playTrackOptimistic } from "../../lib/playerActions";
  import { ICONS } from "../../lib/icons";
  import { navigateTo, getTrackThumbUrl, searchQuery } from "../../lib/store";
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

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    searchQuery.set(e.currentTarget.value);

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
    <div class="search-input-container">
      <span class="search-icon">{@html ICONS.SEARCH}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        placeholder="Artists, songs, or albums"
        value={$searchQuery}
        oninput={handleInput}
        autofocus
      />

      {#if $searchQuery.length > 0}
        <button class="clear-icon-btn" onclick={clearInput}>
          {@html ICONS.CLOSE}
        </button>
      {/if}

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
    {#snippet header()}
      <div class="content-padded">
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
              onwheel={handleHorizontalScroll}
            >
              {#each foundAlbums as album (album._uid)}
                <div class="music-card" role="button" tabindex="0" onclick={() => goToAlbum(album)} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToAlbum(album); }}}>
                  <div class="card-img-container">
                    <ImageLoader
                      src={getTrackThumbUrl(album, "md")}
                      alt={album.name}
                      radius="var(--radius-md)"
                    >
                      {#snippet fallback()}
                        <div class="icon-fallback">💿</div>
                      {/snippet}
                    </ImageLoader>

                    <div class="play-overlay">
                      <span class="overlay-icon">{@html ICONS.PLAY}</span>
                    </div>
                  </div>

                  <div class="card-title" title={album.name}>{album.name}</div>

                  <div class="card-sub-row">
                    <div class="card-sub text-ellipsis">{album.artist}</div>

                    {#if album.year && String(album.year) !== "0"}
                      <div class="meta-tag">{album.year}</div>
                    {/if}

                    {#if album.qualityBadge}
                      <div class="meta-tag quality">
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

  .clear-icon-btn {
    background: transparent;
    border: none;
    color: var(--c-text-muted);
    width: var(--switch-h);
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: var(--space-0);
    margin-right: var(--space-1);
  }
  .clear-icon-btn :global(svg) {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
  }

  .section-spacing {
    margin-top: var(--space-3);
  }

  .section-mb {
    margin-bottom: var(--space-6);
  }

  .empty-text {
    text-align: center;
    color: var(--c-text-secondary);
    margin-top: var(--space-10);
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
    font-size: var(--text-8xl);
    margin-bottom: var(--space-5);
    color: var(--c-icon-faint);
  }

  .spinner {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    border: var(--border-width-thick) solid var(--c-border);
    border-top-color: var(--c-accent);
    border-radius: var(--radius-circle);
    animation: spin 0.6s var(--ease-linear) infinite;
    margin-left: var(--space-2);
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
