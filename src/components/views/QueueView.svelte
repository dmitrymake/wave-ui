<script>
  import { onMount, onDestroy } from "svelte";
  import {
    queue,
    showModal,
    currentSong,
    status,
    isQueueLocked,
    yandexState,
    showToast,
  } from "../../lib/store";
  import { PlayerActions } from "../../lib/mpd/player";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";

  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";

  let isEditMode = false;
  let headerTotalDuration = "";
  let statusInterval;

  $: serverPlayingIndex = Number($status.song);
  let optimisticPlayingIndex = -1;

  $: if (!$isQueueLocked) {
    optimisticPlayingIndex = serverPlayingIndex;
  }

  $: playingIndex = optimisticPlayingIndex;
  $: playingFile = $currentSong.file;
  $: isPlaying = $status.state === "play";

  $: if ($queue.length >= 0) {
    const totalSec = $queue.reduce(
      (acc, t) => acc + (parseFloat(t.time) || 0),
      0,
    );
    if (totalSec > 0) {
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      headerTotalDuration = h > 0 ? `${h} hr ${m} min` : `${m} min`;
    } else {
      headerTotalDuration = "";
    }
  }

  async function fetchYandexStatus() {
    try {
      const res = await fetch("/wave-yandex-api.php?action=get_state");
      if (res.ok) {
        const data = await res.json();
        yandexState.set(data);
      }
    } catch (e) {}
  }

  async function stopDaemon() {
    try {
      await fetch("/wave-yandex-api.php?action=stop_daemon");
      showToast("Daemon stopped (Auto-fill disabled)", "info");
      fetchYandexStatus();
    } catch (e) {
      showToast("Failed to stop daemon", "error");
    }
  }

  onMount(() => {
    fetchYandexStatus();
    statusInterval = setInterval(fetchYandexStatus, 5000);
  });

  onDestroy(() => {
    if (statusInterval) clearInterval(statusInterval);
  });

  function toggleEditMode() {
    isEditMode = !isEditMode;
  }
  function playTrack(pos) {
    if (!isEditMode) MPD.runMpdRequest(`play ${pos}`);
  }
  function handleRemove(index) {
    if (index < optimisticPlayingIndex) optimisticPlayingIndex -= 1;
    PlayerActions.removeFromQueue(index);
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
          await PlayerActions.saveQueue(name);
          MPD.loadPlaylists();
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
        if ($yandexState.active) {
          await stopDaemon();
        }
        queue.set([]);
        currentSong.set({
          title: "Not Playing",
          artist: "",
          album: "",
          file: "",
          stationName: null,
          id: null,
          pos: null,
        });
        status.update((s) => ({
          ...s,
          state: "stop",
          song: -1,
          songid: -1,
          elapsed: 0,
        }));
        await MPD.runMpdRequest("clear");
      },
    });
  }

  function handleMoveTrack(fromIndex, toIndex) {
    let p = optimisticPlayingIndex;
    if (fromIndex === p) p = toIndex;
    else if (fromIndex < p && toIndex >= p) p -= 1;
    else if (fromIndex > p && toIndex <= p) p += 1;
    optimisticPlayingIndex = p;
    PlayerActions.moveTrack(fromIndex, toIndex);
  }
</script>

<div class="view-container">
  <BaseList
    itemsStore={queue}
    {isEditMode}
    emptyText="Queue is empty"
    onMoveItem={handleMoveTrack}
  >
    <div slot="header" class="content-padded">
      <div class="view-header">
        <div class="header-art" style="background: var(--c-surface-active);">
          <div class="header-icon-wrap">{@html ICONS.MENU}</div>
        </div>

        <div class="header-info">
          <div class="header-text-group">
            <div class="header-label">Now Playing</div>

            <h1 class="header-title">
              {#if $yandexState && $yandexState.active}
                <span class="daemon-active">
                  {$yandexState.context_name || "Yandex Stream"}
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

              {#if $yandexState && $yandexState.active}
                <span class="meta-tag active-badge">Daemon Active</span>
              {/if}
            </div>
          </div>

          <div class="header-actions">
            {#if $yandexState && $yandexState.active}
              <button class="btn-primary" on:click={stopDaemon}>
                Stop Stream
              </button>
            {:else}
              <button
                class="btn-secondary"
                on:click={handleClearQueue}
                title="Clear Queue"
                disabled={$queue.length === 0}
              >
                Clear
              </button>
            {/if}

            <button
              class="btn-action"
              on:click={handleSaveQueue}
              title="Save Queue"
              disabled={$queue.length === 0}
            >
              {@html ICONS.SAVE}
            </button>

            <button
              class="btn-action"
              class:active={isEditMode}
              on:click={toggleEditMode}
              title={isEditMode ? "Finish Editing" : "Edit Queue"}
              disabled={$queue.length === 0}
            >
              {@html isEditMode ? ICONS.ACCEPT : ICONS.EDIT}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div slot="row" let:item let:index let:startDrag>
      <TrackRow
        track={item}
        {index}
        {playingIndex}
        {playingFile}
        {isPlaying}
        isEditable={isEditMode}
        on:play={() => playTrack(index)}
        on:remove={() => handleRemove(index)}
        on:startdrag={startDrag}
      />
    </div>
  </BaseList>
</div>

<style>
  @import "./MusicViews.css";

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
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
    100% {
      opacity: 1;
    }
  }
</style>
