<script>
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import ImageLoader from "./ImageLoader.svelte";
  import * as MPD from "../lib/mpd";
  import { ICONS } from "../lib/icons";
  import {
    currentSong,
    status,
    activeMenuTab,
    navigateTo,
    favorites,
    stations,
    getTrackThumbUrl,
    getTrackCoverUrl,
    openContextMenu,
    navigationStack,
  } from "../lib/store.js";
  import { longpress } from "../lib/actions";

  export let track;
  export let index;
  export let isEditable = false;

  const dispatch = createEventDispatcher();
  let isHovering = false;
  let imgError = false;

  $: if (track) imgError = false;

  $: isLiked = $favorites.has(track.file);
  $: isCurrent = track.file === $currentSong.file;
  $: isPlaying = $status.state === "play";

  $: isRadio =
    track.file &&
    (track.file.startsWith("http") || track.file.includes("RADIO"));

  $: showPause = isCurrent && isPlaying && isHovering;
  $: showPlay =
    (isCurrent && !isPlaying && isHovering) || (!isCurrent && isHovering);
  $: showEq = isCurrent && isPlaying && !isHovering;
  $: showStatic = isCurrent && !isPlaying && !isHovering;

  $: title = track.title || track.file?.split("/").pop();
  $: artist = track.artist || "Unknown";
  $: duration = formatDuration(track.time);

  $: quality = track.qualityBadge ? track.qualityBadge.split(" ")[0] : null; // оставляем только первое слово

  $: effectiveStationName = isCurrent ? $currentSong.stationName : null;

  $: imgUrl = imgError
    ? getTrackCoverUrl(track, $stations, effectiveStationName)
    : getTrackThumbUrl(track, "sm", $stations, effectiveStationName);

  function formatDuration(time) {
    if (isRadio) return "∞";
    if (!time) return "0:00";
    const sec = parseInt(time, 10);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function handleAction(e) {
    e.stopPropagation();
    if (isCurrent) MPD.togglePlay();
    else dispatch("play");
  }

  function getContextData() {
    const stack = $navigationStack;
    const currentView = stack[stack.length - 1];
    const tab = $activeMenuTab;

    if (currentView?.view === "details" && currentView.data?.name) {
      return { type: "playlist", playlistName: currentView.data.name, index };
    }

    if (
      currentView?.view === "queue" ||
      (currentView?.view === "root" && tab === "queue")
    ) {
      return { type: "queue", index };
    }

    return { type: "general" };
  }

  function handleMenuClick(e) {
    e.stopPropagation();
    openContextMenu(e, track, getContextData());
  }

  function handleLongPress(e) {
    if (isEditable) return;
    openContextMenu(e.detail.originalEvent, track, getContextData());
  }
</script>

<div
  class="row"
  class:active={isCurrent}
  class:editable={isEditable}
  on:click={() => !isCurrent && dispatch("play")}
  on:mouseenter={() => (isHovering = true)}
  on:mouseleave={() => (isHovering = false)}
  use:longpress
  on:longpress={handleLongPress}
  role="button"
  tabindex="0"
>
  <div class="left">
    {#if isEditable}
      <div
        class="drag-handle"
        on:mousedown={(e) => dispatch("startdrag", e)}
        on:touchstart|passive={(e) => dispatch("startdrag", e)}
        on:click|stopPropagation
        title="Drag to reorder"
      >
        <div class="icon-small">{@html ICONS.DRAG_HANDLE}</div>
      </div>
    {:else}
      <button class="num-box" on:click={handleAction}>
        {#if showEq}
          <div class="eq-anim">
            <span class="bar b1"></span>
            <span class="bar b2"></span>
            <span class="bar b3"></span>
          </div>
        {:else if showPause}
          <div class="icon-small">{@html ICONS.PAUSE}</div>
        {:else if showPlay}
          <div class="icon-small">{@html ICONS.PLAY}</div>
        {:else if showStatic}
          <div class="icon-small accent">{@html ICONS.PLAY}</div>
        {:else}
          <span class="num">{index + 1}</span>
        {/if}
      </button>
    {/if}

    <div class="thumb">
      <ImageLoader
        src={imgUrl}
        alt={title}
        radius="4px"
        on:error={() => (imgError = true)}
      >
        <div slot="fallback" class="icon-ph" in:fade>
          {@html isRadio ? ICONS.RADIO : ICONS.ALBUMS}
        </div>
      </ImageLoader>
    </div>
  </div>

  <div class="info">
    <div class="title-row">
      <div class="title text-ellipsis" {title}>{title}</div>
      {#if quality && !isRadio}
        <span class="quality-badge">{quality}</span>
      {/if}
    </div>
    <div
      class="artist text-ellipsis"
      class:link={!isRadio}
      on:click|stopPropagation={() => {
        if (!isRadio && track.artist) {
          activeMenuTab.set("artists");
          navigateTo("albums_by_artist", track.artist);
        }
      }}
    >
      {artist}
    </div>
  </div>

  <div class="right">
    <button
      class="btn-icon small context-menu-btn"
      title="Options"
      on:click={handleMenuClick}
    >
      {@html ICONS.DOTS}
    </button>

    <button
      class="btn-icon small"
      class:liked={isLiked}
      on:click|stopPropagation={() => MPD.toggleFavorite(track)}
    >
      {@html isLiked ? ICONS.HEART_FILLED : ICONS.HEART}
    </button>

    {#if isEditable}
      <button
        class="btn-icon small remove"
        on:click|stopPropagation={() => dispatch("remove", { index })}
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
  }
  .row:hover {
    background: var(--c-surface-hover);
  }
  .row.active {
    background: var(--c-surface-active);
  }

  .left {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-right: 16px;
    min-width: 80px;
  }

  .drag-handle {
    cursor: grab;
    color: var(--c-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    margin-left: -8px;
  }
  .drag-handle:active {
    cursor: grabbing;
    color: var(--c-text-primary);
  }

  .num-box {
    width: 24px;
    height: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .num {
    font-size: 14px;
    color: var(--c-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .active .num {
    color: var(--c-accent);
  }

  .icon-small {
    width: 16px;
    height: 16px;
    display: flex;
    fill: var(--c-text-primary);
  }
  .icon-small :global(svg) {
    width: 100%;
    height: 100%;
  }
  .icon-small.accent {
    color: var(--c-accent);
  }

  .eq-anim {
    display: flex;
    align-items: flex-end;
    height: 12px;
    width: 13px;
    justify-content: center;
  }
  .bar {
    width: 3px;
    background: var(--c-accent);
    margin: 0 1px;
    border-radius: 1px;
  }
  .b1 {
    animation: eq 0.6s infinite ease-in-out;
  }
  .b2 {
    animation: eq 0.6s infinite ease-in-out 0.2s;
  }
  .b3 {
    animation: eq 0.6s infinite ease-in-out 0.4s;
  }

  @keyframes eq {
    0%,
    100% {
      height: 3px;
    }
    50% {
      height: 12px;
    }
  }

  .thumb {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    background: var(--c-bg-placeholder);
    flex-shrink: 0;
    overflow: hidden;
  }
  .icon-ph {
    color: var(--c-icon-faint);
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-ph :global(svg) {
    width: 20px;
    height: 20px;
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
  .active .title {
    color: var(--c-accent);
  }

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

  .small {
    padding: 6px;
  }
  .small :global(svg) {
    width: 18px;
    height: 18px;
  }
  .remove {
    color: var(--c-text-muted);
  }
  .remove:hover {
    color: var(--c-accent);
  }

  .dur {
    font-size: 13px;
    color: var(--c-text-muted);
    font-variant-numeric: tabular-nums;
    width: 35px;
    text-align: right;
  }

  .context-menu-btn {
    opacity: 0.6;
    transition: opacity 0.2s;
  }
  .context-menu-btn:hover {
    opacity: 1;
    color: var(--c-text-primary);
  }
</style>
