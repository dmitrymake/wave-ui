<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 dmitrymake -->
<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { writable } from "svelte/store";
  import { YoutubeApi, isYoutubeAuthError } from "../../lib/youtube";
  import { YoutubeService, rememberYoutubeTracks } from "../../lib/youtubeService";
  import { youtubeStatus, youtubeSettingsVersion, youtubeFavorites, youtubeMeta } from "../../lib/stores/youtube";
  import { youtubeSearchFilter, YOUTUBE_SEARCH_FILTERS, fetchYoutubeMeta } from "../../lib/sources/youtubeSource";
  import { navigationStack, navIdentityKey, navigateTo, showToast, currentSong, status, assignHash } from "../../lib/store";
  import { PlayerActions } from "../../lib/playback/player";
  import { ICONS } from "../../lib/icons";
  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import Input from "../ui/Input.svelte";
  import Button from "../ui/Button.svelte";
  import ImageLoader from "../ImageLoader.svelte";
  import YoutubeCards from "./youtube/YoutubeCards.svelte";
  import SkeletonGrid from "../SkeletonGrid.svelte";
  import Skeleton from "../Skeleton.svelte";
  import { countLabel } from "../../lib/format";
  import type { YoutubeTrack, YoutubeCard, YoutubeSection, YoutubeDetails, YoutubeSearchFilter } from "../../lib/types/youtube";

  const tracksStore = writable<YoutubeTrack[]>([]);
  let tracks = $state<YoutubeTrack[]>([]);
  let cards = $state<YoutubeCard[]>([]);
  let sections = $state<YoutubeSection[]>([]);
  let playlists = $state<YoutubeCard[]>([]);
  let title = $state("");
  let cover = $state("");
  let subtitle = $state("");
  let totalTracks = $state<number | undefined>(undefined);
  let searchQuery = $state("");
  let searchFilter = $state<YoutubeSearchFilter>("songs");
  let loading = $state(false);
  let loadingMore = $state(false);
  let playingAll = $state(false);
  let hiddenCount = $state(0);
  let offset = $state(0);
  let hasMore = $state(false);
  let error = $state("");
  let reloadVersion = $state(0);
  let loadSequence = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const currentView = $derived($navigationStack[$navigationStack.length - 1]);
  const view = $derived(currentView?.view ?? "root");
  const isDashboard = $derived(view === "root");
  const isSearch = $derived(view === "youtube_search");
  const isFavorites = $derived(view === "youtube_playlist" && currentView?.data?.id === "LM");
  const headerTitle = $derived(isFavorites ? "Favorites" : title);
  const headerLabel = $derived(view === "youtube_album_details" ? "Album" : view === "youtube_artist_details" ? "Artist" : view === "youtube_radio" ? "Radio" : "Playlist");
  const collectionCards = $derived.by(() => {
    const favorite = playlists.find((card) => card.id === "LM");
    return [{ ...(favorite ?? { id: "LM", title: "Favorites", kind: "playlist" as const }),
      trackCount: typeof favorite?.trackCount === "number" ? favorite.trackCount : $youtubeFavorites.size || undefined },
      ...playlists.filter((card) => card.id !== "LM")];
  });
  const viewKey = $derived(navIdentityKey(view, currentView?.data));

  $effect(() => {
    void viewKey;
    void $youtubeSettingsVersion;
    void reloadVersion;
    const mode = view;
    const data = currentView?.data ?? {};
    if ($youtubeStatus.authorized) untrack(() => { void loadView(mode, data); });
    else {
      loadSequence++;
      loading = false;
    }
  });

  onDestroy(() => {
    loadSequence++;
    clearTimeout(searchTimer);
  });

  function applyDetails(data: YoutubeDetails) {
    title = data.title;
    cover = data.image ?? "";
    totalTracks = data.trackCount ?? (data.hasMore ? totalTracks : data.tracks.length);
    tracks = data.tracks;
    tracksStore.set(tracks.map((track, index) => ({ ...track, _uid: `${track.id}:${index}` })));
    cards = data.cards;
    hiddenCount = data.hiddenCount;
    offset = data.nextOffset ?? 0;
    hasMore = data.hasMore === true;
    rememberYoutubeTracks(data.tracks);
    void fetchYoutubeMeta(data.tracks.filter((track) => !track.time).map((track) => track.file));
  }

  function reportError(e: unknown) {
    if (isYoutubeAuthError(e)) youtubeStatus.update((s) => ({ ...s, authorized: false }));
    return e instanceof Error ? e.message : "Could not load YouTube Music";
  }

  async function loadView(mode: string, data: Record<string, unknown>) {
    const seq = ++loadSequence;
    clearTimeout(searchTimer);
    loading = true;
    loadingMore = false;
    error = "";
    tracks = [];
    tracksStore.set([]);
    cards = [];
    sections = [];
    hasMore = false;
    hiddenCount = 0;
    title = typeof data.title === "string" ? data.title : "";
    cover = typeof data.image === "string" ? data.image : "";
    subtitle = typeof data.subtitle === "string" ? data.subtitle : "";
    totalTracks = typeof data.trackCount === "number" ? data.trackCount : undefined;
    try {
      if (mode === "root") {
        title = "YouTube Music";
        searchQuery = "";
        const [home, library] = await Promise.allSettled([YoutubeApi.home(), YoutubeApi.playlists()]);
        if (seq !== loadSequence) return;
        sections = home.status === "fulfilled" ? home.value.map((section) => ({ ...section,
          cards: section.cards.filter((card) => !(card.kind === "playlist" && card.id === "LM")),
        })).filter((section) => section.cards.length || section.tracks.length || section.hiddenCount) : [];
        playlists = library.status === "fulfilled" ? library.value : [];
        rememberYoutubeTracks(sections.flatMap((section) => section.tracks));
        void fetchYoutubeMeta(sections.flatMap((section) => section.tracks).filter((track) => !track.time).map((track) => track.file));
        const failures = [home, library].filter((result) => result.status === "rejected");
        if (failures.length) error = reportError((failures[0] as PromiseRejectedResult).reason);
      } else if (mode === "youtube_search") {
        searchQuery = String(data.query ?? "");
        searchFilter = youtubeSearchFilter(data.filter);
        title = "Search results";
        if (!searchQuery.trim()) return;
        const results = await YoutubeApi.search(searchQuery, searchFilter);
        if (seq !== loadSequence) return;
        applyDetails({ ...results, title: "Search results" });
      } else {
        const id = String(data.id ?? "");
        let result: YoutubeDetails;
        if (mode === "youtube_playlist") result = await YoutubeApi.playlist(id);
        else if (mode === "youtube_album_details") result = await YoutubeApi.album(id);
        else if (mode === "youtube_artist_details") result = await YoutubeApi.artist(id);
        else if (mode === "youtube_radio") result = await YoutubeApi.radio(id);
        else throw new Error("Unknown YouTube Music view");
        if (seq !== loadSequence) return;
        applyDetails(result);
      }
    } catch (e) {
      if (seq === loadSequence) error = reportError(e);
    } finally {
      if (seq === loadSequence) loading = false;
    }
  }

  function search(immediate = false) {
    clearTimeout(searchTimer);
    // Invalidate the old response as soon as the user types, before the debounce fires.
    loadSequence++;
    const query = searchQuery.trim();
    const filter = searchFilter;
    const run = () => {
      if (view === "youtube_search" && currentView?.data?.query === query && currentView?.data?.filter === filter) reloadVersion++;
      else navigateTo("youtube_search", { query, filter });
    };
    if (immediate) run(); else searchTimer = setTimeout(run, 350);
  }

  function openCard(card: YoutubeCard) {
    const target = card.kind === "artist" ? "youtube_artist_details" : card.kind === "album" ? "youtube_album_details" : "youtube_playlist";
    navigateTo(target, { id: card.id, title: card.title, image: card.image, subtitle: card.subtitle, trackCount: card.trackCount });
  }

  async function loadMore() {
    if (loadingMore || !hasMore || view !== "youtube_playlist") return;
    const seq = loadSequence;
    loadingMore = true;
    try {
      const page = await YoutubeApi.playlist(String(currentView?.data?.id), offset);
      if (seq !== loadSequence) return;
      tracks = [...tracks, ...page.tracks];
      tracksStore.set(tracks.map((track, index) => ({ ...track, _uid: `${track.id}:${index}` })));
      hiddenCount += page.hiddenCount;
      offset = page.nextOffset ?? offset;
      hasMore = page.hasMore === true;
      rememberYoutubeTracks(page.tracks);
    } catch (e) {
      if (seq === loadSequence) error = reportError(e);
    } finally {
      if (seq === loadSequence) loadingMore = false;
    }
  }

  async function playAll(append = false) {
    if (playingAll || !tracks.length) return;
    const seq = loadSequence;
    const playlistId = view === "youtube_playlist" ? String(currentView?.data?.id) : null;
    let all = [...tracks];
    let nextOffset = offset;
    let more = hasMore;
    playingAll = true;
    try {
      // Include every playlist page, applying the saved filters on the server.
      // Finish fetching before replacing the queue, so a failed page keeps playback intact.
      while (playlistId && more) {
        const page = await YoutubeApi.playlist(playlistId, nextOffset);
        if (seq !== loadSequence) return;
        if (page.hasMore && (!page.nextOffset || page.nextOffset <= nextOffset)) throw new Error("Could not load the remaining playlist tracks");
        all.push(...page.tracks);
        nextOffset = page.nextOffset ?? nextOffset;
        more = page.hasMore === true;
      }
      if (seq !== loadSequence) return;
      if (append) { rememberYoutubeTracks(all); await PlayerActions.addAllToQueue(all); }
      else await YoutubeService.playTracks(all);
    } catch (e) {
      showToast(reportError(e), "error");
    } finally { playingAll = false; }
  }

  function playTrack(track: YoutubeTrack) {
    if (!$youtubeStatus.playbackReady) { showToast("Playback needs Deno 2.3+ or Node.js 22+ on moOde", "error"); return; }
    void PlayerActions.playUri(track.file, track);
  }

</script>

{#if !$youtubeStatus.authorized}
  <div class="view-container scrollable">
    <div class="not-connected content-padded">
      <h2>YouTube Music Not Connected</h2>
      <p>Connect your browser session in Settings → Services.</p>
      <Button variant="primary" onclick={() => assignHash("/settings")}>Open Settings</Button>
    </div>
  </div>
{:else}
  <BaseList itemsStore={tracksStore} isLoading={loading && !isDashboard} emptyText={hiddenCount ? "No tracks remain after filtering" : isDashboard ? "" : "No tracks found"}>
    {#snippet header()}
      {#if isDashboard || isSearch}
        <div class="content-padded no-bottom-pad"><div class="search-controls search-block">
          <Input search bind:value={searchQuery} placeholder="Search YouTube Music…" ariaLabel="Search YouTube Music"
            oninput={() => search()} onclear={() => search(true)} onkeydown={(event) => { if (event.key === "Enter") search(true); }}>
            {#snippet icon()}{@html ICONS.SEARCH}{/snippet}
          </Input>
          <select aria-label="YouTube Music search category" bind:value={searchFilter} onchange={() => search(true)}>
            {#each YOUTUBE_SEARCH_FILTERS as filter}<option value={filter}>{filter.charAt(0).toUpperCase() + filter.slice(1)}</option>{/each}
          </select>
        </div></div>
      {/if}
      {#if error}
        <div class="error-panel content-padded" role="alert">
          <p>{error}</p><Button variant="secondary" size="sm" onclick={() => reloadVersion++}>Retry</Button>
        </div>
      {/if}
      {#if !$youtubeStatus.playbackReady}
        <p class="filter-hint content-padded">Playback needs Deno 2.3+ or Node.js 22+ on the moOde device.</p>
      {/if}
      {#if isDashboard}
        <div class="content-padded">
          {#if loading}
            <SkeletonGrid count={4} layout="horizontal" skeletonCard={false} heading="Collection & Mixes" />
          {:else}
            <h2 class="header-label">Collection & Mixes</h2>
            <YoutubeCards cards={collectionCards} onopen={openCard} />
          {/if}
        </div>
        {#each sections as section, sectionIndex}
          <div class="content-padded no-bottom-pad">
            <h3 class="header-label">{section.title}</h3>
            {#if section.cards.length}<YoutubeCards cards={section.cards} onopen={openCard} />{/if}
            {#if section.hiddenCount}<p class="filter-hint">{section.hiddenCount} tracks hidden by your filters</p>{/if}
          </div>
          {#each section.tracks as track, index (`${sectionIndex}:${track.id}:${index}`)}
            <TrackRow track={{ ...track, time: track.time || $youtubeMeta[track.id]?.time || 0 }} {index} isPlaying={$status.state === "play"} playingFile={$currentSong.file}
              onplay={() => playTrack(track)} />
          {/each}
        {/each}
      {:else}
        <div class="content-padded">
        {#if !isSearch}
        <div class="view-header">
          <div class="header-art" style={isFavorites ? "background: var(--grad-favorites);" : ""}>
            {#if isFavorites}<div class="icon-wrap">{@html ICONS.HEART_FILLED}</div>
            {:else if loading && !cover}<Skeleton width="100%" height="100%" radius="var(--radius-md)" />
            {:else}
              <ImageLoader src={cover} alt={headerTitle} radius="var(--radius-md)">
                {#snippet fallback()}<div class="icon-fallback">{@html headerLabel === "Artist" ? ICONS.ARTISTS : ICONS.ALBUMS}</div>{/snippet}
              </ImageLoader>
            {/if}
          </div>
          <div class="header-info">
            <div class="header-text-group">
              <div class="header-label">{headerLabel}</div>
              {#if loading && !headerTitle}
                <Skeleton width="70%" height="40px" />
              {:else}
                <h1 class="header-title" title={headerTitle}>{headerTitle}</h1>
              {/if}
              {#if subtitle && !isFavorites}
                <div class="header-subtitle-row"><h2 class="header-sub-text">{subtitle}</h2></div>
              {/if}
              {#if totalTracks !== undefined}
                <p class="meta-line"><span class="meta-text"><span class="meta-item">{countLabel(totalTracks, "track")}</span></span></p>
              {/if}
            </div>
            <div class="header-actions">
              <Button variant="primary" disabled={loading || playingAll || loadingMore || !tracks.length || !$youtubeStatus.playbackReady} onclick={() => playAll()}>
                {playingAll ? "Loading…" : "Play All"}
              </Button>
              <Button variant="secondary" disabled={loading || playingAll || loadingMore || !tracks.length} onclick={() => playAll(true)}>To Queue</Button>
              </div>
          </div>
        </div>
        {/if}
        {#if hiddenCount}<p class="filter-hint">{hiddenCount} tracks hidden by your filters</p>{/if}
        {#if cards.length}<YoutubeCards {cards} onopen={openCard} />{/if}
        </div>
      {/if}
    {/snippet}
    {#snippet row({ item, index })}
        <TrackRow track={{ ...item, time: item.time || $youtubeMeta[item.id]?.time || 0 }} {index} isPlaying={$status.state === "play"} playingFile={$currentSong.file}
          onplay={() => playTrack(item)} />
    {/snippet}
    {#snippet footer()}
      {#if hasMore}
        <div class="load-more"><Button variant="secondary" disabled={loadingMore || playingAll} onclick={loadMore}>{loadingMore ? "Loading…" : "Load more"}</Button></div>
      {/if}
    {/snippet}
  </BaseList>
{/if}

<style>
  .not-connected { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: var(--space-3); text-align: center; }
  .not-connected p { color: var(--c-text-muted); }
  .search-controls { display: flex; gap: var(--space-2); align-items: center; }
  .search-controls :global(.field) { flex: 1; min-width: 0; }
  select { background: var(--c-surface-input); color: var(--c-text-primary); border: var(--border-default); border-radius: var(--radius-md); padding: var(--space-2); min-height: var(--control-h-lg); max-width: 40%; font-size: var(--text-base); }
  .error-panel { color: var(--c-error); }
  .filter-hint { color: var(--c-text-muted); font-size: var(--text-sm); }
  .load-more { display: flex; justify-content: center; padding: var(--space-4); }
</style>
