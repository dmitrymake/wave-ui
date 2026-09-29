<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    queue,
    showModal,
    currentSong,
    status,
    isQueueLocked,
  } from "../../lib/store";
  import {
    playQueuePosition,
    clearQueue,
    removeFromQueue,
    moveTrack,
    saveQueue,
    loadPlaylists,
  } from "../../lib/playerActions";
  import { getActiveDaemon } from "../../lib/sources";
  import { ICONS } from "../../lib/icons";
  import { formatTotalDuration } from "../../lib/utils";
  import { countLabel } from "../../lib/format";

  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import Button from "../ui/Button.svelte";
  import IconButton from "../ui/IconButton.svelte";

  let isEditMode = $state(false);
  let headerTotalDuration = $state("");

  const daemon = getActiveDaemon();
  let daemonState = $state<{ active: boolean; label: string | null }>({
    active: false,
    label: null,
  });
  let stopPolling: (() => void) | undefined;
  let unsubscribeDaemon: (() => void) | undefined;

  let serverPlayingIndex = $derived(Number($status.song));
  let optimisticPlayingIndex = $state(-1);

  $effect(() => {
    if (!$isQueueLocked) {
      optimisticPlayingIndex = serverPlayingIndex;
    }
  });

  let playingIndex = $derived(optimisticPlayingIndex);
  let playingFile = $derived($currentSong.file);
  let isPlaying = $derived($status.state === "play");

  $effect(() => {
    const totalSec = $queue.reduce(
      (acc, t) => acc + (parseFloat(String(t.time)) || 0),
      0,
    );
    headerTotalDuration = formatTotalDuration(totalSec);
  });

  onMount(() => {
    if (daemon) {
      unsubscribeDaemon = daemon.state.subscribe((s) => (daemonState = s));
      stopPolling = daemon.startPolling();
    }
  });

  onDestroy(() => {
    stopPolling?.();
    unsubscribeDaemon?.();
  });

  function toggleEditMode() {
    isEditMode = !isEditMode;
  }
  function playTrack(pos: number) {
    if (!isEditMode) playQueuePosition(pos);
  }
  function handleRemove(index: number) {
    if (index < optimisticPlayingIndex) optimisticPlayingIndex -= 1;
    else if (index === optimisticPlayingIndex) optimisticPlayingIndex = -1;
    removeFromQueue(index);
  }

  async function handleSaveQueue() {
    showModal({
      title: "Save Playlist",
      message: "Enter a name for this playlist:",
      type: "prompt",
      placeholder: "Playlist Name",
      confirmLabel: "Save",
      onConfirm: async (name) => {
        if (name && name.trim().length > 0) {
          await saveQueue(name);
          loadPlaylists();
        }
      },
    });
  }

  function handleClearQueue() {
    if ($queue.length === 0) return;
    showModal({
      title: "Clear Queue",
      message: "Are you sure you want to clear the queue?",
      confirmLabel: "Clear All",
      type: "confirm",
      onConfirm: async () => {
        if (daemonState.active) {
          await daemon?.stop();
        }
        await clearQueue();
      },
    });
  }

  function handleMoveTrack(fromIndex: number, toIndex: number) {
    let p = optimisticPlayingIndex;
    if (fromIndex === p) p = toIndex;
    else if (fromIndex < p && toIndex >= p) p -= 1;
    else if (fromIndex > p && toIndex <= p) p += 1;
    optimisticPlayingIndex = p;
    moveTrack(fromIndex, toIndex);
  }
</script>

<div class="view-container">
  <BaseList
    itemsStore={queue}
    {isEditMode}
    emptyText="Queue is empty"
    onMoveItem={handleMoveTrack}
  >
    {#snippet header()}
      <div class="content-padded">
        <div class="view-header">
          <div class="header-art" style="background: var(--c-surface-active);">
            <div class="icon-wrap">{@html ICONS.MENU}</div>
          </div>

          <div class="header-info">
            <div class="header-text-group">
              <div class="header-label">Now Playing</div>

              <h1 class="header-title">
                {#if daemonState.active}
                  {daemonState.label}
                {:else}
                  Current Queue
                {/if}
              </h1>

              <!-- The live stream is said once, by the badge and its pulsing dot.
                   The title used to pulse and turn red as well (on the Pi and
                   the desktop), which with the red eyebrow and the red STOP
                   STREAM pill made four accents for one fact. -->
              <p class="meta-line">
                <span class="meta-text">
                  <span class="meta-item">{countLabel($queue.length, "track")}</span>
                  {#if headerTotalDuration}
                    <span class="meta-item">{headerTotalDuration}</span>
                  {/if}
                </span>
                {#if daemonState.active}
                  <span class="badge badge--accent badge--live">Daemon Active</span>
                {/if}
              </p>
            </div>

            <div class="header-actions">
              {#if daemonState.active}
                <Button variant="primary" onclick={() => daemon?.stop()}>
                  Stop Stream
                </Button>
              {:else}
                <Button
                  variant="secondary"
                  onclick={handleClearQueue}
                  title="Clear Queue"
                  disabled={$queue.length === 0}
                >
                  Clear
                </Button>
              {/if}

              <IconButton
                variant="filled"
                size="md"
                ariaLabel="Save Queue"
                title="Save Queue"
                icon={ICONS.SAVE}
                onclick={handleSaveQueue}
                disabled={$queue.length === 0}
              />

              <IconButton
                variant="filled"
                size="md"
                tone="accent"
                active={isEditMode}
                ariaLabel={isEditMode ? "Finish Editing" : "Edit Queue"}
                title={isEditMode ? "Finish Editing" : "Edit Queue"}
                icon={isEditMode ? ICONS.ACCEPT : ICONS.EDIT}
                onclick={toggleEditMode}
                disabled={$queue.length === 0}
              />
            </div>
          </div>
        </div>
      </div>
    {/snippet}

    {#snippet row({ item, index, startDrag })}
      <TrackRow
        track={item}
        {index}
        {playingIndex}
        {playingFile}
        {isPlaying}
        isEditable={isEditMode}
        onplay={() => playTrack(index)}
        onremove={() => handleRemove(index)}
        onstartdrag={startDrag}
      />
    {/snippet}
  </BaseList>
</div>

<style>
  /* The daemon's title styling (.daemon-active: accent colour + an endless
     opacity pulse, neutralised on phones only) is gone — the .badge--live in the
     meta line carries the liveness on every screen size, and the title is plain
     white everywhere: red eyebrow + red title + red badge + red pill was a wall
     of accent with nothing to look at. The header itself is the shared
     .view-header (MusicViews.css), art block included on a phone. */
</style>
