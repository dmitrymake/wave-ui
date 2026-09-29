<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { MOTION } from "../../../lib/transitions";
  import {
    showToast,
    alarmTime,
    isAlarmEnabled,
    alarmPlaylist,
    playlists,
  } from "../../../lib/store";
  import { MSG } from "../../../lib/messages";
  import { ApiActions } from "../../../lib/api";
  import { ICONS } from "../../../lib/icons";
  import Toggle from "../../ui/Toggle.svelte";

  let serverTime = $state("--:--");
  let timeInterval: ReturnType<typeof setInterval> | undefined;

  async function fetchServerTime() {
    const t = await ApiActions.getServerTime();
    if (t) serverTime = t;
  }

  onMount(() => {
    fetchServerTime();
    timeInterval = setInterval(fetchServerTime, 60000);
  });

  onDestroy(() => {
    if (timeInterval) clearInterval(timeInterval);
  });

  // Toggling the switch and changing the time in quick succession used to fire
  // two independent writes, and the slower one won — the stored alarm then
  // disagreed with what the UI showed. The guard serialises them.
  let alarmBusy = $state(false);
  let alarmQueued = false;

  async function handleSaveAlarm() {
    if (alarmBusy) {
      alarmQueued = true;
      return;
    }
    alarmBusy = true;
    try {
      do {
        alarmQueued = false;
        await ApiActions.setAlarm($isAlarmEnabled, $alarmTime, $alarmPlaylist);
      } while (alarmQueued);
      if ($isAlarmEnabled) {
        showToast(MSG.alarmSet($alarmTime), "success");
      }
    } catch (e) {
      showToast(MSG.SETTINGS_FAILED_ALARM_SYNC, "error");
    } finally {
      alarmBusy = false;
    }
  }
</script>

<div class="section">
  <div class="section-header">
    <span>Alarm Clock</span>
  </div>
  <Card>
    <div class="row space-between">
      <span class="row-label">Current Player Time</span>
      <!-- A value, like every other value in settings: it was an accent-filled
           mono chip, the loudest thing on the screen for a read-only clock. -->
      <span class="row-value">{serverTime}</span>
    </div>

    <div class="separator"></div>

    <div class="row space-between">
      <span class="row-label">Enable Alarm</span>
      <Toggle
        bind:checked={$isAlarmEnabled}
        ariaLabel="Enable Alarm"
        onchange={handleSaveAlarm}
        disabled={alarmBusy}
      />
    </div>

    {#if $isAlarmEnabled}
      <div class="separator" in:fade={{ duration: MOTION.fast }}></div>

      <div class="row space-between" in:fade={{ duration: MOTION.fast }}>
        <label class="row-label" for="alarm-time">Wake-up Time</label>
        <input
          id="alarm-time"
          type="time"
          bind:value={$alarmTime}
          disabled={alarmBusy}
          onchange={handleSaveAlarm}
        />
      </div>

      <div class="separator" in:fade={{ duration: MOTION.fast }}></div>

      <div class="row space-between" in:fade={{ duration: MOTION.fast }}>
        <label class="row-label" for="alarm-pl">Playlist</label>
        <div class="select-wrapper">
          <select
            id="alarm-pl"
            bind:value={$alarmPlaylist}
            onchange={handleSaveAlarm}
          >
            {#each $playlists as pl}
              <option value={pl.name}>{pl.name}</option>
            {/each}
          </select>
          <div class="select-arrow">{@html ICONS.CHEVRON_DOWN}</div>
        </div>
      </div>
    {/if}
  </Card>
</div>

<style>
  /* .section / .section-header live in settings.css (they were copied into all
     five sections). */

  input[type="time"] {
    background: var(--c-surface-input);
    border: var(--border-default);
    color: var(--c-text-primary);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    outline: none;
  }

  /* This input is not inside an .field wrapper, so it has no focus-within style
     and `outline: none` left it with NO focus indicator at all — the only
     focusable control in the app that was keyboard-blind. Same treatment as the
     text fields: a brighter neutral border. */
  input[type="time"]:focus-visible {
    border-color: var(--c-focus-line);
  }

  .select-wrapper {
    position: relative;
    max-width: 150px;
  }

  select {
    appearance: none;
    background: var(--c-surface-input);
    border: var(--border-default);
    color: var(--c-text-primary);
    padding: var(--space-2) var(--space-8) var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    outline: none;
    width: 100%;
    /* Same focus treatment as the other bare inputs in settings. */
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .select-arrow {
    position: absolute;
    right: var(--space-2);
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    color: var(--c-text-muted);
  }
  .select-arrow :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
