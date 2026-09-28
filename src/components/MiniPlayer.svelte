<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { sendArt, receiveArt } from "../lib/transitions";
  import { seek, nav, togglePlay } from "../lib/playerActions";
  import { ICONS } from "../lib/icons";
  import {
    currentSong,
    status,
    isFullPlayerOpen,
    getTrackCoverUrl,
    stations,
    openContextMenu,
    type EventWithDetail,
  } from "../lib/store.js";
  import { longpress } from "../lib/actions";
  import { formatTime, isRadioStream, getQualityLabel } from "../lib/playerHelpers";
  import { createSeekController } from "../lib/seekDrag.svelte";
  import ImageLoader from "./ImageLoader.svelte";
  import VolumeSlider from "./VolumeSlider.svelte";
  import PlayModeButton from "./PlayModeButton.svelte";
  import LikeButton from "./LikeButton.svelte";
  import IconButton from "./ui/IconButton.svelte";

  let isHoveringBar = $state(false);
  let progressBar: HTMLElement;

  const stop = (fn: (e: Event) => void) => (e: Event) => {
    e.stopPropagation();
    fn(e);
  };

  let duration = $derived($status.duration > 0 ? $status.duration : 1);
  let elapsed = $derived($status.elapsed || 0);
  let isPlaying = $derived($status.state === "play");
  let isRadio = $derived(isRadioStream($currentSong));
  let displayTitle = $derived($currentSong.title || "Not Playing");
  let displayArtist = $derived($currentSong.stationName || $currentSong.artist || "Moode");
  let artSrc = $derived(getTrackCoverUrl($currentSong, $stations, $currentSong.stationName));

  // The dock keeps mouse drags on `window` so they keep following the cursor
  // outside the thin bar.
  const seekCtl = createSeekController({
    getElement: () => progressBar,
    getDuration: () => duration,
    getElapsed: () => elapsed,
    getIsRadio: () => isRadio,
    seekTo: seek,
    windowMouse: true,
  });

  let isDragging = $derived(seekCtl.isDragging);
  let pct = $derived(seekCtl.fraction * 100);
  let smooth = $derived(isPlaying && !isDragging && !isRadio);
  let qualityLabel = $derived(getQualityLabel($status));

  function handleBarKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (isRadio) return;
    const step = e.shiftKey ? 10 : 5;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      seek(Math.max(0, elapsed - step));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      seek(Math.min(duration, elapsed + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      seek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      seek(duration);
    }
  }

  // Clean up window listeners if the dock unmounts mid-drag (e.g. full player opens).
  onDestroy(() => {
    seekCtl.destroy();
  });

  function handleContext(e: MouseEvent) {
    e.stopPropagation();
    openContextMenu(e, $currentSong, { type: "general", source: "miniplayer" });
  }

  // The dock opens the full player on click/Enter, but control clicks must not
  // bubble into it: Svelte 5 delegates events, so a child's stopPropagation can
  // arrive too late. Guard on the event target instead — anything interactive
  // (buttons, sliders, inputs) is handled by its own control.
  function isControlEvent(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t?.closest?.('button, a, input, [role="slider"], [role="switch"]');
  }

  function handleDockOpen(e: MouseEvent) {
    if (!isControlEvent(e)) isFullPlayerOpen.set(true);
  }

  function handleInfoKey(e: KeyboardEvent) {
    if (isControlEvent(e)) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      isFullPlayerOpen.set(true);
    }
  }

  function handleLongPress(e: CustomEvent<{ originalEvent: Event }>) {
    openContextMenu(e.detail.originalEvent as EventWithDetail, $currentSong, { type: "general", source: "miniplayer" });
  }
</script>

{#if !$isFullPlayerOpen}
  <!-- role=group (not button): the dock contains focusable controls, so the
       open action lives on the info block below instead of the whole dock. -->
  <div
    class="dock"
    transition:fade={{ duration: 220 }}
    onclick={handleDockOpen}
    use:longpress
    onlongpress={handleLongPress}
    role="group"
    aria-label="Now playing"
  >
    <div
      class="progress-shadow"
      style="transform: scaleX({pct / 100}); transition: {smooth ? 'transform var(--dur-slow-2) var(--ease-linear)' : 'none'}"
    ></div>

    <div
      class="progress-bar"
      class:radio={isRadio}
      class:dragging={isDragging}
      bind:this={progressBar}
      onmouseenter={() => (isHoveringBar = true)}
      onmouseleave={() => (isHoveringBar = false)}
      onmousedown={(e) => { e.stopPropagation(); seekCtl.onMouseDown(e); }}
      ontouchstart={(e) => { e.stopPropagation(); seekCtl.onTouchStart(e); }}
      ontouchmove={seekCtl.onTouchMove}
      ontouchend={seekCtl.onTouchEnd}
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleBarKey}
      role="slider"
      aria-label="Playback progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={isRadio ? "Live stream" : `${formatTime(elapsed)} of ${formatTime(duration)}`}
      tabindex="0"
    >
      <div class="rail"></div>
      <div
        class="fill"
        style="transform: scaleX({pct / 100}); transition: {smooth ? 'transform var(--dur-slow-2) var(--ease-linear)' : 'none'}"
      ></div>
      {#if !isRadio}
        <div
          class="knob"
          style="left: {pct}%; transition: transform var(--dur-fast){smooth ? ', left var(--dur-slow-2) var(--ease-linear)' : ''}"
        ></div>
      {/if}

      {#if (isHoveringBar || isDragging) && !isRadio}
        <div class="tooltip current" style="left: {pct}%">
          {formatTime(seekCtl.displaySeconds)}
        </div>
        <span></span>
      {/if}
    </div>

    <div class="grid">
      <!-- Info block doubles as the full-player opener (keyboard: Enter/Space
           anywhere except the nested menu button, guarded in handleInfoKey). -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="info"
        role="button"
        tabindex="0"
        aria-label={`Open full player: ${displayTitle} by ${displayArtist}`}
        onclick={handleDockOpen}
        onkeydown={handleInfoKey}
      >
        <div
          class="art"
          in:receiveArt|global={{ key: "np-art" }}
          out:sendArt|global={{ key: "np-art" }}
        >
          <ImageLoader src={artSrc} alt="" radius="4px">
            {#snippet fallback()}
              <div class="icon-fallback">
                {@html isRadio ? ICONS.RADIO : ICONS.ALBUMS}
              </div>
            {/snippet}
          </ImageLoader>
        </div>

        <div class="meta">
          <div class="title-row">
            <div class="title text-ellipsis" title={displayTitle}>
              {displayTitle}
            </div>
            <IconButton
              class="tiny-dots"
              size="sm"
              ariaLabel={`More actions for ${displayTitle}`}
              title="More actions"
              icon={ICONS.DOTS}
              onclick={handleContext}
            />
          </div>
          <div class="artist-row">
            <div class="artist text-ellipsis" title={displayArtist}>
              {displayArtist}
            </div>
            {#if qualityLabel}
              <span class="meta-tag quality">{qualityLabel}</span>
            {/if}
          </div>
        </div>
      </div>

      <div class="controls">
        <LikeButton track={$currentSong} compact class="only-wide" />

        <IconButton ariaLabel="Previous" onclick={stop(() => nav("previous"))}>
          {@html ICONS.PREVIOUS}
        </IconButton>

        <button class="play-btn flex-center" onclick={stop(togglePlay)} aria-label={$status.state === "play" ? "Pause" : "Play"} title={$status.state === "play" ? "Pause" : "Play"}>
          {@html $status.state === "play" ? ICONS.PAUSE : ICONS.PLAY}
        </button>

        <IconButton ariaLabel="Next" onclick={stop(() => nav("next"))}>
          {@html ICONS.NEXT}
        </IconButton>

        {#if !isRadio}
          <PlayModeButton compact class="only-wide" />
        {/if}
      </div>

      <div class="volume only-wide">
        <VolumeSlider compact />
      </div>
    </div>
  </div>
{/if}

<style>
  .dock {
    position: fixed; bottom: var(--space-0); left: var(--space-0); right: var(--space-0);
    height: var(--mini-player-height);
    /* Opaque (= the glass colour at full alpha) so we can drop the persistent
       backdrop-filter blur — it ran a 2-pass gaussian over the scrolling content
       every frame for the whole session, invisibly under a ~0.95-opaque bar. */
    background: var(--c-bg-main);
    border-top: var(--border-default-dim);
    z-index: var(--z-dock);
    cursor: pointer; user-select: none;
  }

  .progress-shadow {
    position: absolute; top: var(--space-0); left: var(--space-0); bottom: var(--space-0);
    width: 100%; transform-origin: left center;
    background: var(--c-surface-button); z-index: 101;
    pointer-events: none; opacity: 0.1;
  }

  .progress-bar {
    position: absolute; top: calc(-1 * var(--space-2xs)); left: var(--space-0); width: 100%;
    height: var(--space-14px); z-index: 110; cursor: pointer;
    display: flex; align-items: center;
  }
  .progress-bar.radio { cursor: default; opacity: var(--opacity-hidden); pointer-events: none; }

  /* The rail is a hairline that sits on ONE line: the 1px below the dock's top
     edge, which is also where the knob's centre is and where the hovered 4px
     bar grows around. It used to be three numbers for that one line — top 6px
     at 2px tall, top 5px at 4px tall, and a -7px knob — which is why the
     numbers drifted apart whenever the bar's thickness changed. Centred in its
     own hit-area instead, the thickness is the only number left. */
  .rail {
    position: absolute; left: var(--space-0); width: 100%;
    top: var(--space-0); bottom: var(--space-0); height: var(--space-0_5);
    margin-block: auto;
    background: var(--c-border); border-radius: var(--radius-full);
    transition: height var(--dur-fast);
  }
  .fill {
    position: absolute; left: var(--space-0); width: 100%;
    top: var(--space-0); bottom: var(--space-0); height: var(--space-0_5);
    margin-block: auto;
    transform-origin: left center; border-radius: var(--radius-full);
    background: var(--c-accent); pointer-events: none;
  }
  .progress-bar:hover .rail, .progress-bar:hover .fill { height: var(--space-1); }
  .knob {
    position: absolute; top: 50%; left: var(--space-0);
    width: var(--space-3); height: var(--space-3); border-radius: var(--radius-circle);
    background: var(--c-text-primary); transform: translate(-50%, -50%) scale(0);
    box-shadow: var(--shadow-xs-strong);
  }
  .progress-bar:hover .knob { transform: translate(-50%, -50%) scale(1); }
  /* :hover never fires on a touchscreen, so the knob (and the time tooltip)
     stayed invisible while a finger dragged the bar — seeking blind. The
     `dragging` class is set from the drag state, not from hover. */
  .progress-bar.dragging .knob { transform: translate(-50%, -50%) scale(1.3); }
  .progress-bar.dragging .rail,
  .progress-bar.dragging .fill { height: var(--space-1); }
  /* The bar is a wide hit area, so the focus indicator is the knob itself: it
     is normally hover-only, so reveal and enlarge it for keyboard focus (fill
     only — no ring, same as every other control). */
  .progress-bar:focus-visible { outline: none; }
  .progress-bar:focus-visible .knob {
    transform: translate(-50%, -50%) scale(1.6);
  }

  /* The same chip as every .meta-tag in the app (4px cap, 8px sides, tight
     leading), not a 3px nudge: the time labels under a rail and the tags under a
     title are the same role and were two different boxes. */
  .tooltip {
    position: absolute; top: calc(-1 * var(--space-7));
    background: var(--c-surface-active); color: var(--c-text-primary);
    font-size: var(--text-xs); font-weight: var(--weight-bold);
    padding: var(--space-1) var(--space-2);
    line-height: var(--leading-none);
    border-radius: var(--radius-sm); transform: translateX(-50%);
    pointer-events: none; box-shadow: var(--shadow-sm);
  }

  .grid {
    display: grid; grid-template-columns: 1fr max-content 1fr;
    height: 100%; padding: var(--space-0) var(--space-8); align-items: center;
    gap: var(--space-5); position: relative; z-index: 105;
  }

  /* The whole info block opens the full player, so its focus plate is a chip
     too — square corners on a 64px thumbnail block read as a defect. */
  .info { display: flex; align-items: center; gap: var(--space-4); overflow: hidden; border-radius: var(--radius-sm); }
  .art {
    width: var(--thumb-lg); height: var(--thumb-lg); border-radius: var(--radius-sm);
    background: var(--c-bg-placeholder); overflow: hidden;
    flex-shrink: 0; position: relative;
  }
  .icon-fallback {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    color: var(--c-icon-faint);
  }
  .icon-fallback :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); opacity: var(--opacity-faint); }

  /* Title and artist are one group: the 2px between them is the group's own gap
     (a pair of lines on one thumb), owned by the column that stacks them rather
     than by a margin on the title — one owner, and no chance of a second margin
     joining it. */
  .meta {
    display: flex; flex-direction: column; justify-content: center;
    gap: var(--space-0_5); overflow: hidden;
  }
  .title-row { display: flex; align-items: center; gap: var(--space-2); }
  .title { font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--c-text-primary); }
  .artist-row { display: flex; align-items: center; gap: var(--space-2); }
  .artist { font-size: var(--text-base); color: var(--c-text-secondary); }

  /* The dock's secondary action stays quieter than its neighbours until the
     finger is on it; the button itself is the shared primitive. */
  .title-row :global(.tiny-dots) {
    opacity: var(--opacity-dim);
  }
  .title-row :global(.tiny-dots:hover) { opacity: var(--opacity-visible); }

  .controls { display: flex; align-items: center; gap: var(--space-5); }

  .play-btn {
    width: var(--circle-play-md); height: var(--circle-play-md); border-radius: var(--radius-circle);
    background: var(--c-text-primary); color: var(--c-text-inverse);
    box-shadow: var(--shadow-md);
    transition: transform var(--dur-instant); border: none;
  }
  .play-btn:hover { transform: scale(1.05); }
  .play-btn:active { transform: scale(0.95); }
  .play-btn :global(svg) { width: var(--icon-size-lg); height: var(--icon-size-lg); }

  .volume { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); }

  /* :global() is load-bearing: LikeButton, PlayModeButton and the volume block
     receive this class through a prop, so the element that ends up carrying it
     is rendered by ANOTHER component and does not have MiniPlayer's scoping
     class. A plain `.only-wide` rule silently matched nothing, which is how a
     390px dock ended up with five controls and a one-letter title.

     What stays on a phone: the transport that has to work at a glance. The heart
     and the play mode are one tap away in the full player. */
  @media (max-width: 768px) {
    :global(.only-wide) { display: none !important; }
    .grid { grid-template-columns: 1fr max-content; padding: var(--space-0) var(--space-4); }
    .play-btn { width: var(--control-h-lg); height: var(--control-h-lg); }
    .art { width: var(--thumb-md); height: var(--thumb-md); }
    .title-row :global(.tiny-dots) { display: none; }
    .meta-tag { display: none; }
  }
</style>
