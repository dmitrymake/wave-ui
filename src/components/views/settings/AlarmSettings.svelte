<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
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
      <span class="label-text">Current Player Time</span>
      <span class="mono-badge">{serverTime}</span>
    </div>

    <div class="separator"></div>

    <div class="row space-between">
      <span class="label-text">Enable Alarm</span>
      <Toggle
        bind:checked={$isAlarmEnabled}
        ariaLabel="Enable Alarm"
        onchange={handleSaveAlarm}
        disabled={alarmBusy}
      />
    </div>

    {#if $isAlarmEnabled}
      <div class="separator" in:fade></div>

      <div class="row space-between" in:fade>
        <label for="alarm-time">Wake up time</label>
        <input
          id="alarm-time"
          type="time"
          bind:value={$alarmTime}
          disabled={alarmBusy}
          onchange={handleSaveAlarm}
        />
      </div>

      <div class="separator" in:fade></div>

      <div class="row space-between" in:fade>
        <label for="alarm-pl">Playlist</label>
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
  .section {
    margin-bottom: var(--space-8);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    color: var(--c-text-primary);
    margin-bottom: var(--space-3);
    padding-left: var(--space-1);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .row.space-between {
    justify-content: space-between;
    width: 100%;
  }

  label,
  .label-text {
    font-size: var(--text-base);
    color: var(--c-text-secondary);
    font-weight: var(--weight-semibold);
  }

  input[type="time"] {
    background: var(--c-surface-input);
    border: var(--border-default);
    color: var(--c-text-primary);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-family: inherit;
    outline: none;
  }

  /* This input is not inside an .field wrapper, so it has no focus-within style
     and `outline: none` left it with NO focus indicator at all — the only
     focusable control in the app that was keyboard-blind. Same treatment as the
     text fields: a brighter neutral border. */
  input[type="time"]:focus-visible {
    border-color: var(--c-focus-line);
  }

  .mono-badge {
    font-family: var(--font-mono);
    background: var(--c-accent);
    color: var(--c-text-primary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-base);
    font-weight: var(--weight-bold);
  }

  .separator {
    height: var(--space-px);
    background: var(--c-border);
    opacity: var(--opacity-faint);
    margin: var(--space-1) var(--space-0);
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
