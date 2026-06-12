<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import type { Track } from "../lib/types";
  import TrackThumb from "./TrackThumb.svelte";
  import Skeleton from "./Skeleton.svelte";
  import LikeButton from "./LikeButton.svelte";
  import TrackPlaybackIndicator from "./TrackPlaybackIndicator.svelte";
  import * as MPD from "../lib/mpd";
  import { ICONS } from "../lib/icons";
  import {
    activeMenuTab,
    stations,
    currentSong,
    getTrackThumbUrl,
    openContextMenu,
    navigationStack,
    navigateTo,
  } from "../lib/store.js";
  import { longpress } from "../lib/actions";
  import { isRemoteUrl } from "../lib/utils";
  import { getYandexIdFromUrl } from "../lib/sources/yandexUri";

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

  let isYandexTrack = $derived(track.isYandex || track.service === "yandex");
  let currentView = $derived($navigationStack[$navigationStack.length - 1]);
  let isQueueContext = $derived(
    currentView?.view === "queue" ||
    (currentView?.view === "root" && $activeMenuTab === "queue"));
  let isExactActive = $derived(isQueueContext ? Number(index) === playingIndex : false);
  // Yandex tracks carry the same numeric id on both sides, but expressed
  // differently: source lists use `yandex:<id>` while the playing MPD file is a
  // RAM cache path / CDN url. Compare by extracted id so the now-playing
  // highlight works in album/playlist/search views too, not just the queue.
  let playingYandexId = $derived(isYandexTrack ? getYandexIdFromUrl($currentSong.file) : null);
  let isPlayingFile = $derived(
    isYandexTrack
      ? playingYandexId !== null && getYandexIdFromUrl(track.file) === playingYandexId
      : track.file === playingFile,
  );
  let showStripes = $derived(isPlayingFile && !isExactActive);
  let isRadio = $derived(
    track.file &&
    (isRemoteUrl(track.file) || String(track.file).includes("RADIO")) &&
    !isYandexTrack);
  let displayTitle = $derived(track.title || track.file?.split("/").pop());
  let duration = $derived(formatDuration(track.time));
  let quality = $derived(track.qualityBadge ? track.qualityBadge.split(" ")[0] : null);
  let thumbKey = $derived(getTrackThumbUrl(track, "sm", $stations, null));

  function formatDuration(time: number | string | undefined) {
    if (isRadio) return "\u221e";
    const val = parseFloat(String(time));
    if (!val || isNaN(val) || val === 0) return "0:00";
    const totalSeconds = Math.round(val);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function handleAction(e: Event) {
    e.stopPropagation();
    if (isPlayingFile) MPD.togglePlay();
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
    const origEvent = detail?.originalEvent ?? e;
    openContextMenu(origEvent, track, getContextData());
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isExactActive) onplay?.();
    }
  }

  function handleArtistClick(e: MouseEvent) {
    e.stopPropagation();
    if (isYandexTrack && track.artist) {
      activeMenuTab.set("yandex");
      if (window.location.hash !== "#/yandex") history.pushState(null, "", "#/yandex");
      navigationStack.set([{ view: "root" }, { view: "yandex_search", data: { query: track.artist } }]);
    } else if (!isRadio && track.artist) {
      activeMenuTab.set("artists");
      if (window.location.hash !== "#/artists") history.pushState(null, "", "#/artists");
      navigationStack.set([{ view: "root" }]);
      navigateTo("albums_by_artist", { name: track.artist });
    }
    onartistclick?.(track);
  }
</script>

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
  role="button"
  tabindex="0"
>
  <div class="left">
    {#if isEditable}
      <div
        class="drag-handle"
        onmousedown={(e) => onstartdrag?.(e)}
        ontouchstart={(e) => onstartdrag?.(e)}
        onclick={(e) => e.stopPropagation()}
        title="Drag to reorder"
        role="presentation"
      >
        <div class="icon-small">{@html ICONS.DRAG_HANDLE}</div>
      </div>
    {:else}
      <TrackPlaybackIndicator
        {index}
        {isExactActive}
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
      {:else if track.file && !isYandexTrack}
        <div class="title text-ellipsis">{track.file.split("/").pop()}</div>
      {:else}
        <Skeleton width="60%" height="15px" radius="4px" />
      {/if}
      {#if quality && !isRadio}
        <span class="meta-tag quality">{quality}</span>
      {/if}
    </div>

    {#if track.artist}
      {#if !isRadio || isYandexTrack}
        <div
          class="artist text-ellipsis link"
          onclick={handleArtistClick}
          onkeydown={(e) => { if (e.key === "Enter") handleArtistClick(e as unknown as MouseEvent); }}
          role="link"
          tabindex="0"
        >
          {track.artist}
        </div>
      {:else}
        <div class="artist text-ellipsis">
          {track.artist}
        </div>
      {/if}
    {:else if track.title || (track.file && !isYandexTrack)}
      <div class="artist text-ellipsis">Unknown Artist</div>
    {:else}
      <Skeleton width="40%" height="13px" radius="4px" style="margin-top: 4px;" />
    {/if}
  </div>

  <div class="right">
    {#if isYandexTrack}
      <span class="yandex-icon-inline" title="Yandex Music">
        {@html ICONS.YANDEX}
      </span>
    {/if}

    <button class="btn-icon small context-menu-btn" onclick={handleMenuClick}>
      {@html ICONS.DOTS}
    </button>

    <LikeButton {track} compact />

    {#if isEditable}
      <button
        class="btn-icon small remove"
        onclick={(e) => { e.stopPropagation(); onremove?.({ index }); }}
      >
        {@html ICONS.REMOVE}
      </button>
    {:else}
      <div class="dur">{duration}</div>
    {/if}
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    width: 100%;
    height: 64px;
    padding: 0 16px;
    box-sizing: border-box;
    border-radius: var(--radius-md);
    border-bottom: 1px solid var(--c-border-dim);
    transition: background 0.2s;
    cursor: default;
    user-select: none;
    background: transparent;
    position: relative;
    overflow: hidden;
  }
  .row:hover { background: var(--c-surface-hover); }
  .row.active { background: var(--c-surface-active); }

  .row.striped::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    border-radius: inherit;
    box-sizing: border-box;
    background-image: repeating-linear-gradient(
      -45deg, transparent, transparent 10px,
      var(--c-surface-active) 10px, var(--c-surface-active) 20px
    );
    opacity: 0.4;
    background-size: 28.28px 28.28px;
    animation: moveStripes 2s linear infinite;
  }
  @keyframes moveStripes {
    0% { background-position: 0 0; }
    100% { background-position: 28.28px 0; }
  }

  .left, .info, .right { position: relative; z-index: 1; }
  .left {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-right: 16px;
    width: 80px;
    min-width: 80px;
    flex-shrink: 0;
  }

  .drag-handle {
    cursor: grab;
    color: var(--c-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }
  .drag-handle:active { cursor: grabbing; color: var(--c-text-primary); }

  .icon-small {
    width: 16px;
    height: 16px;
    display: flex;
    fill: var(--c-text-primary);
  }
  .icon-small :global(svg) { width: 100%; height: 100%; }

  .thumb {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    background: var(--c-bg-placeholder);
    flex-shrink: 0;
    overflow: hidden;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
    min-width: 0;
  }
  .title {
    font-size: 15px;
    font-weight: 500;
    color: var(--c-text-primary);
    line-height: 1.2;
  }
  .active .title { color: var(--c-accent); }

  .artist {
    font-size: 13px;
    color: var(--c-text-secondary);
    width: fit-content;
    max-width: 100%;
  }
  .artist.link:hover {
    text-decoration: underline;
    color: var(--c-text-primary);
    cursor: pointer;
  }

  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .small { padding: 5px; }
  .small :global(svg) { width: 18px; height: 18px; }
  .remove { color: var(--c-text-muted); }
  .remove:hover { color: var(--c-accent); }
  .dur {
    font-size: 13px;
    color: var(--c-text-muted);
    font-variant-numeric: tabular-nums;
    width: 28px;
    text-align: right;
  }
  .context-menu-btn { opacity: 0.6; transition: opacity 0.2s; }
  .context-menu-btn:hover { opacity: 1; color: var(--c-text-primary); }

  .yandex-icon-inline {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    margin-right: 4px;
    opacity: 0.8;
  }
  .yandex-icon-inline :global(svg) { width: 100%; height: 100%; }
</style>
