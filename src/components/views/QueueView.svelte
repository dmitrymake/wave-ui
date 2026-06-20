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

  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";
  import Button from "../ui/Button.svelte";

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
            <div class="header-icon-wrap">{@html ICONS.MENU}</div>
          </div>

          <div class="header-info">
            <div class="header-text-group">
              <div class="header-label">Now Playing</div>

              <h1 class="header-title">
                {#if daemonState.active}
                  <span class="daemon-active">
                    {daemonState.label}
                  </span>
                {:else}
                  Current Queue
                {/if}
              </h1>

              <div class="meta-badges">
                <span class="meta-tag">{$queue.length} tracks</span>
                {#if headerTotalDuration}
                  <span class="meta-tag">{headerTotalDuration}</span>
                {/if}

                {#if daemonState.active}
                  <span class="meta-tag active-badge">Daemon Active</span>
                {/if}
              </div>
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

              <Button
                variant="ghost"
                icon
                ariaLabel="Save Queue"
                onclick={handleSaveQueue}
                title="Save Queue"
                disabled={$queue.length === 0}
              >
                {@html ICONS.SAVE}
              </Button>

              <Button
                variant={isEditMode ? "primary" : "ghost"}
                icon
                ariaLabel={isEditMode ? "Finish Editing" : "Edit Queue"}
                onclick={toggleEditMode}
                title={isEditMode ? "Finish Editing" : "Edit Queue"}
                disabled={$queue.length === 0}
              >
                {@html isEditMode ? ICONS.ACCEPT : ICONS.EDIT}
              </Button>
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


  .header-icon-wrap {
    width: 64px;
    height: 64px;
    color: var(--c-text-secondary);
  }
  .header-icon-wrap :global(svg) {
    width: 100%;
    height: 100%;
    stroke-width: 1.5;
  }

  .daemon-active {
    color: var(--c-accent);
    animation: pulse-text 2s infinite;
  }

  .active-badge {
    background: var(--c-accent);
    color: white;
  }

  @keyframes pulse-text {
    0% {
      opacity: var(--opacity-visible);
    }
    50% {
      opacity: var(--opacity-strong);
    }
    100% {
      opacity: var(--opacity-visible);
    }
  }
</style>
