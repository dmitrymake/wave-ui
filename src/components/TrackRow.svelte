<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import type { Track } from "../lib/types";
  import TrackThumb from "./TrackThumb.svelte";
  import Skeleton from "./Skeleton.svelte";
  import LikeButton from "./LikeButton.svelte";
  import IconButton from "./ui/IconButton.svelte";
  import TrackPlaybackIndicator from "./TrackPlaybackIndicator.svelte";
  import { togglePlay } from "../lib/playerActions";
  import { ICONS } from "../lib/icons";
  import {
    activeMenuTab,
    stations,
    currentSong,
    getTrackThumbUrl,
    openContextMenu,
    navigationStack,
    navigateTo,
    resetNavigation,
    type EventWithDetail,
  } from "../lib/store.js";
  import { longpress } from "../lib/actions";
  import { isRemoteUrl, formatClock } from "../lib/utils";
  import { formatQuality } from "../lib/quality";
  import { resolveSourceForTrack } from "../lib/sources/trackSource";

  let {
    track,
    index,
    isEditable = false,
    playingIndex = -1,
    playingFile = null,
    isPlaying = false,
    onplay,
    onartistclick,
    onstartdrag,
    onremove,
  }: {
    track: Track;
    index: number;
    isEditable?: boolean;
    playingIndex?: number;
    playingFile?: string | null;
    isPlaying?: boolean;
    onplay?: () => void;
    onartistclick?: (track: Track) => void;
    onstartdrag?: (e: MouseEvent | TouchEvent) => void;
    onremove?: (detail: { index: number }) => void;
  } = $props();

  let isHovering = $state(false);

  // The streaming source (today only Yandex) that owns this track, if any. Drives
  // the brand icon, vibe actions and stream-aware now-playing/artist handling
  // below via TrackSource capabilities, so the row never depends on a concrete service.
  let source = $derived(resolveSourceForTrack(track));
  let isStreamTrack = $derived(!!source);
  let currentView = $derived($navigationStack[$navigationStack.length - 1]);
  let isQueueContext = $derived(
    currentView?.view === "queue" ||
    (currentView?.view === "root" && $activeMenuTab === "queue"));
  let isExactActive = $derived(isQueueContext ? Number(index) === playingIndex : false);
  // Delegate stream-source now-playing matching (e.g. `yandex:<id>` list uris vs
  // the RAM-cache/CDN url the player reports) to the source; fall back to a plain
  // file comparison for generic local/radio tracks.
  let isPlayingFile = $derived(
    source?.matchesPlaying
      ? source.matchesPlaying(track, $currentSong.file)
      : track.file === playingFile,
  );
  let showStripes = $derived(isPlayingFile && !isExactActive);
  let isRadio = $derived(
    track.file &&
    (isRemoteUrl(track.file) || String(track.file).includes("RADIO")) &&
    !isStreamTrack);
  let displayTitle = $derived(track.title || track.file?.split("/").pop());
  let duration = $derived(formatDuration(track.time));
  let thumbKey = $derived(getTrackThumbUrl(track, "sm", $stations, null));

  // A row looks the same in every list (cover, title, artist, the same right
  // cluster), so moving between an album and the queue changes nothing but the
  // songs. The one thing an album row drops is the per-row format: the album's
  // header already carries it ("Mixed" when it varies).
  let isAlbumContext = $derived(currentView?.view === "tracks_by_album");
  let quality = $derived(isAlbumContext || isRadio ? "" : formatQuality(track.qualityBadge, "short"));

  function formatDuration(time: number | string | undefined) {
    if (isRadio) return "∞";
    const val = parseFloat(String(time));
    if (!val || isNaN(val) || val === 0) return "0:00";
    return formatClock(Math.round(val));
  }

  function handleAction(e?: Event) {
    e?.stopPropagation();
    if (isPlayingFile) togglePlay();
    else onplay?.();
  }

  function getContextData() {
    if (currentView?.view === "details" && currentView.data?.name) {
      return { type: "playlist" as const, playlistName: currentView.data.name as string, index };
    }
    if (isQueueContext) return { type: "queue" as const, index };
    return { type: "general" as const };
  }

  function handleMenuClick(e: MouseEvent) {
    e.stopPropagation();
    openContextMenu(e, track, getContextData());
  }

  function handleLongPress(e: Event) {
    if (isEditable) return;
    const detail = (e as CustomEvent<{ originalEvent?: Event }>).detail;
    const origEvent = (detail?.originalEvent ?? e) as EventWithDetail;
    openContextMenu(origEvent, track, getContextData());
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Ignore keys from nested controls (artist/menu/like buttons bubble here);
    // without this, Enter on a child fires both its action and row playback.
    if ((e.target as HTMLElement | null)?.closest?.("button, a, input, [role='slider']")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isExactActive) onplay?.();
    }
  }

  function handleArtistClick(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    if (source?.navigateToArtist && track.artist) {
      source.navigateToArtist(track);
    } else if (!isRadio && track.artist) {
      // Canonical navigation: tab + reset + navigateTo. The hash follows via
      // the Router.updateUrl callback in App.svelte — no direct history.* here.
      activeMenuTab.set("artists");
      resetNavigation();
      navigateTo("albums_by_artist", { name: track.artist });
    }
    onartistclick?.(track);
  }
</script>

<!-- Row is a listitem with row-level activation (Enter/Space plays) plus nested
     action buttons (menu/like/remove). Nested-interactive-in-listitem is
     intentional (Spotify-style); inner buttons stay tabbable and labelled. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="row"
  class:active={isExactActive}
  class:striped={showStripes}
  class:editable={isEditable}
  onclick={() => !isExactActive && onplay?.()}
  onkeydown={handleKeyDown}
  onmouseenter={() => (isHovering = true)}
  onmouseleave={() => (isHovering = false)}
  use:longpress
  onlongpress={handleLongPress}
  role="listitem"
  tabindex="0"
  aria-label={`${displayTitle ?? "Track"} by ${track.artist || "Unknown Artist"}`}
  aria-current={isExactActive ? "true" : undefined}
>
  <div class="left">
    {#if isEditable}
      <button
        class="drag-handle"
        onmousedown={(e) => onstartdrag?.(e)}
        ontouchstart={(e) => onstartdrag?.(e)}
        onclick={(e) => e.stopPropagation()}
        title="Drag to reorder"
        aria-label="Drag to reorder {displayTitle ?? 'track'}"
      >
        <div class="icon-small">{@html ICONS.DRAG_HANDLE}</div>
      </button>
    {:else}
      <!-- The song that is playing reads the same wherever it appears: an album
           or a playlist showing the playing FILE gets the equaliser and the
           pause-on-hover the queue's exact position gets (its tap already
           toggled playback — the glyph said "play" while the action paused). -->
      <TrackPlaybackIndicator
        {index}
        isExactActive={isExactActive || showStripes}
        {isPlaying}
        {isHovering}
        onaction={handleAction}
      />
    {/if}

    <div class="thumb">
      {#key thumbKey}
        <TrackThumb {track} isRadio={!!isRadio} alt={displayTitle ?? ""} />
      {/key}
    </div>
  </div>

  <div class="info">
    <div class="title-row">
      {#if track.title}
        <div class="title text-ellipsis" title={track.title}>{track.title}</div>
      {:else if track.file && !isStreamTrack}
        <div class="title text-ellipsis" title={track.file.split("/").pop()}>{track.file.split("/").pop()}</div>
      {:else}
        <Skeleton width="60%" height="15px" radius="4px" />
      {/if}
      {#if quality}<span class="badge badge--sm">{quality}</span>{/if}
    </div>

    {#if track.artist}
      {#if !isRadio || isStreamTrack}
        <button
          class="artist text-ellipsis link"
          title={track.artist}
          onclick={handleArtistClick}
          aria-label={`Go to artist ${track.artist}`}
        >
          {track.artist}
        </button>
      {:else}
        <div class="artist text-ellipsis" title={track.artist}>
          {track.artist}
        </div>
      {/if}
    {:else if !track.artist && (track.title || (track.file && !isStreamTrack))}
      <div class="artist text-ellipsis">Unknown Artist</div>
    {:else if !track.artist}
      <!-- The 2px that separates the title from the artist is .info's own gap
           (a real artist line gets exactly that), so the placeholder must not
           add a second margin on top of it. -->
      <Skeleton width="40%" height="13px" radius="4px" style="margin-top: var(--space-0);" />
    {/if}
  </div>

  <!-- Always the same cluster, always visible: [service] … ♡ duration. In edit
       mode only the duration gives way to the remove button, inside the same
       fixed slot, so nothing in the row moves. -->
  <div class="right">
    {#if source?.brandIcon}
      <span class="brand-icon-inline" title={source.id}>
        {@html source.brandIcon}
      </span>
    {/if}

    <IconButton
      class="context-menu-btn"
      size="sm"
      ariaLabel={`More actions for ${displayTitle ?? "track"}`}
      title="More actions"
      icon={ICONS.DOTS}
      onclick={handleMenuClick}
    />

    <LikeButton {track} compact />

    <div class="end-slot">
      {#if isEditable}
        <IconButton
          class="remove"
          size="sm"
          ariaLabel={`Remove ${displayTitle ?? "track"} from list`}
          title="Remove"
          icon={ICONS.REMOVE}
          onclick={(e) => { e.stopPropagation(); onremove?.({ index }); }}
        />
      {:else}
        <div class="dur">{duration}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .row {
    /* The row is its own size container: the density below follows the width
       the row actually gets — 358px on a phone, 336px beside the Pi's docked
       player, 1190px on a desktop — not the width of the viewport. */
    /* Width of the number column (TrackPlaybackIndicator's .num-box), which
       the drag handle mirrors in edit mode. */
    --num-w: 28px;
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--row-h);
    padding: var(--space-0) var(--space-4);
    box-sizing: border-box;
    border-radius: var(--radius-md);
    border-bottom: var(--border-default-dim);
    transition: background var(--dur-fast) var(--ease-default);
    cursor: default;
    user-select: none;
    background: transparent;
    position: relative;
    overflow: hidden;
  }
  /* Hover where there is one: a touchscreen would keep the plate on the row
     that was just tapped. Touch gets :active — without it a tap on a row had no
     feedback until MPD answered 200-500ms later. */
  @media (hover: hover) {
    .row:hover { background: var(--c-surface-hover); }
  }
  .row:active { background: var(--c-surface-active); }

  /* THE NOW-PLAYING ROW — the queue's exact position (.active) and the playing
     file anywhere else (.striped, class name kept for its tests). One look for
     both: the accent title and the equaliser in the number column.
     No plate: the old active plate (surface-active, ~#414141) put the accent
     title at 2.7:1 and the muted duration at 2.9:1; on the page ground the accent
     is 4.9:1. The moving diagonal stripes are gone too — a second, louder
     now-playing signal that animated for as long as the song played. */
  .active .title,
  .striped .title { color: var(--c-accent-btn); }

  .left, .info, .right { position: relative; z-index: 1; }
  .left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-right: var(--space-4);
    flex-shrink: 0;
  }

  .drag-handle {
    cursor: grab;
    color: var(--c-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    /* The handle is the ONLY way to reorder on a touchscreen. */
    width: var(--control-h-lg);
    height: var(--control-h-lg);
    /* Edit mode must not move the row: the handle takes exactly the footprint
       of the number it replaces (TrackPlaybackIndicator's 28px .num-box) and its
       larger hit box overhangs evenly into the row's padding and the gap. */
    margin-inline: calc((var(--num-w) - var(--control-h-lg)) / 2);
    background: none;
    border: none;
    padding: 0;
    border-radius: var(--radius-sm);
  }
  .drag-handle:active { cursor: grabbing; color: var(--c-text-primary); }
  @media (pointer: coarse) {
    .drag-handle {
      width: var(--target-touch);
      height: var(--target-touch);
      margin-inline: calc((var(--num-w) - var(--target-touch)) / 2);
    }
  }

  .icon-small {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    display: flex;
    fill: var(--c-text-primary);
  }
  .icon-small :global(svg) { width: 100%; height: 100%; }

  .thumb {
    width: var(--thumb-sm);
    height: var(--thumb-sm);
    border-radius: var(--radius-sm);
    background: var(--c-bg-placeholder);
    flex-shrink: 0;
    overflow: hidden;
  }

  /* The title and the artist are one group — the 2px between two lines of one
     track — so the gap belongs to the column that stacks them, not to a margin
     on the title. */
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-0_5);
  }
  .title {
    font-size: var(--text-lg);
    font-weight: var(--weight-medium);
    color: var(--c-text-primary);
    line-height: var(--leading-snug);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .artist {
    font-size: var(--text-base);
    color: var(--c-text-secondary);
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-family: inherit;
    line-height: inherit;
  }
  /* The artist name is a text button, so its focus plate is a chip with real
     padding — negative margins keep the row's two-line layout byte-identical
     while giving the highlight a comfortable target instead of hugging the
     glyphs. */
  .artist.link {
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
    /* The underline is drawn below the descenders at a hairline weight, so
       "Georgy" stays readable under it (the UA default cut through the g/y). */
    text-underline-offset: 0.2em;
    text-decoration-thickness: var(--border-width-thin);
    text-decoration-skip-ink: auto;
  }
  @media (hover: hover) {
    .artist.link:hover {
      text-decoration-line: underline;
      color: var(--c-text-primary);
      cursor: pointer;
    }
  }

  /* A focused row gets the shared gray plate; everything written on it follows
     the plate's label colour instead of keeping its own (the accent title was
     2.7:1 on it, the secondary artist 3.1:1, and in gruvbox the cream title
     2.4:1 on the light plate). */
  .row:focus-visible :is(.title, .artist, .dur, .brand-icon-inline) { color: inherit; }

  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    /* Air between the truncated title and the first mark, so "…" never
       touches the service icon. */
    padding-left: var(--space-2);
  }
  /* Touch: the 44px boxes already keep the glyphs 24px apart, so the gaps
     between them shrink and the title keeps its width. */
  @media (pointer: coarse) {
    .right { gap: var(--space-1); }
  }
  /* The last slot holds the duration, or the remove button in edit mode, at one
     width — the wider of the two — in EVERY list, so entering edit mode moves
     nothing and the "…" and the heart stand on the same vertical in an album,
     the queue and a playlist. Its font size is the timecode's, so 4.5ch is the
     timecode's own ch. */
  .end-slot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
    font-size: var(--text-sm);
    width: max(4.5ch, var(--control-h-lg));
  }
  @media (pointer: coarse) {
    .end-slot { width: max(4.5ch, var(--target-touch)); }
  }
  /* Timecode role: --text-sm / --weight-medium / tabular-nums, shared with the
     player's time row. A fixed column (4.5ch fits "88:88" in tabular figures) so
     the title column never jitters between rows, and a long timecode grows the
     box instead of spilling out of it. */
  /* Secondary, not muted: the muted grey fell to 4.0:1 on the hover plate. */
  .dur {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--c-text-secondary);
    font-variant-numeric: tabular-nums;
    min-width: 4.5ch;
    flex-shrink: 0;
    text-align: right;
  }
  /* Destructive action: the × is muted at rest and red under the finger. The
     button itself is the shared primitive. */
  .right :global(.remove) { color: var(--c-text-muted); }
  .right :global(.remove:hover) { color: var(--c-accent-btn); }

  /* The row's secondary action stays quiet until the finger is on it. */
  .right :global(.context-menu-btn) { opacity: var(--opacity-muted); }
  .right :global(.context-menu-btn:hover) { opacity: var(--opacity-visible); }

  .brand-icon-inline {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    display: flex;
    align-items: center;
    margin-right: var(--space-1);
    opacity: var(--opacity-strong);
  }
  .brand-icon-inline :global(svg) { width: 100%; height: 100%; }

  @media (prefers-reduced-motion: reduce) {
    .row { transition: none; }
  }
</style>
