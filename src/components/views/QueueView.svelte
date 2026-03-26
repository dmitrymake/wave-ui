<script lang="ts">
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
  import { MSG } from "../../lib/messages";
  import { PlayerActions } from "../../lib/mpd/player";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";

  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";

  let isEditMode = $state(false);
  let headerTotalDuration = $state("");
  let statusInterval: ReturnType<typeof setInterval> | undefined;

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
    if ($queue.length >= 0) {
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
  });

  async function fetchYandexStatus() {
    try {
      const res = await fetch("/wave-yandex-api.php?action=get_state");
      if (res.ok) {
        const data = await res.json();
        yandexState.set(data);
      }
    } catch (e) {
      console.warn("[Queue] Failed to fetch Yandex state:", e);
    }
  }

  async function stopDaemon() {
    try {
      await fetch("/wave-yandex-api.php?action=stop_daemon");
      showToast(MSG.QUEUE_DAEMON_STOPPED, "info");
      fetchYandexStatus();
    } catch (e) {
      showToast(MSG.QUEUE_FAILED_STOP_DAEMON, "error");
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
  function playTrack(pos: number) {
    if (!isEditMode) MPD.runMpdRequest(`play ${pos}`);
  }
  function handleRemove(index: number) {
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

  function handleMoveTrack(fromIndex: number, toIndex: number) {
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
                <button class="btn-primary" onclick={stopDaemon}>
                  Stop Stream
                </button>
              {:else}
                <button
                  class="btn-secondary"
                  onclick={handleClearQueue}
                  title="Clear Queue"
                  disabled={$queue.length === 0}
                >
                  Clear
                </button>
              {/if}

              <button
                class="btn-action"
                onclick={handleSaveQueue}
                title="Save Queue"
                disabled={$queue.length === 0}
              >
                {@html ICONS.SAVE}
              </button>

              <button
                class="btn-action"
                class:active={isEditMode}
                onclick={toggleEditMode}
                title={isEditMode ? "Finish Editing" : "Edit Queue"}
                disabled={$queue.length === 0}
              >
                {@html isEditMode ? ICONS.ACCEPT : ICONS.EDIT}
              </button>
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
