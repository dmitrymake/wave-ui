<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
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

  async function handleSaveAlarm() {
    try {
      await ApiActions.setAlarm($isAlarmEnabled, $alarmTime, $alarmPlaylist);
      if ($isAlarmEnabled) {
        showToast(MSG.alarmSet($alarmTime), "success");
      }
    } catch (e) {
      showToast(MSG.SETTINGS_FAILED_ALARM_SYNC, "error");
    }
  }

  function toggleAlarm() {
    isAlarmEnabled.update((v) => !v);
    handleSaveAlarm();
  }
</script>

<div class="section">
  <div class="section-header">
    <span>Alarm Clock</span>
  </div>
  <div class="card">
    <div class="row space-between">
      <span class="label-text">Current Player Time</span>
      <span class="mono-badge">{serverTime}</span>
    </div>

    <div class="separator"></div>

    <div class="row space-between">
      <label for="toggle-alarm">Enable Alarm</label>
      <button
        id="toggle-alarm"
        class="toggle-btn"
        class:active={$isAlarmEnabled}
        onclick={toggleAlarm}
        aria-pressed={$isAlarmEnabled}
        aria-label="Enable Alarm"
      >
        <div class="toggle-circle"></div>
      </button>
    </div>

    {#if $isAlarmEnabled}
      <div class="separator" in:fade></div>

      <div class="row space-between" in:fade>
        <label for="alarm-time">Wake up time</label>
        <input
          id="alarm-time"
          type="time"
          bind:value={$alarmTime}
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
  </div>
</div>

<style>
  .section {
    margin-bottom: 32px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 700;
    color: var(--c-text-primary);
    margin-bottom: 12px;
    padding-left: 4px;
  }

  .card {
    background: var(--c-bg-card);
    border: 1px solid var(--c-border);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .row.space-between {
    justify-content: space-between;
    width: 100%;
  }

  label,
  .label-text {
    font-size: 14px;
    color: var(--c-text-secondary);
    font-weight: 600;
  }

  input[type="time"] {
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    color: var(--c-text-primary);
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 16px;
    font-family: inherit;
    outline: none;
  }

  .mono-badge {
    font-family: monospace;
    background: var(--c-accent);
    color: var(--c-text-primary);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: bold;
  }

  .separator {
    height: 1px;
    background: var(--c-border);
    opacity: 0.5;
    margin: 4px 0;
  }

  .toggle-btn {
    width: 44px;
    height: 24px;
    background: var(--c-surface-input);
    border-radius: 12px;
    border: 1px solid var(--c-border);
    position: relative;
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s;
    padding: 0;
  }

  .toggle-btn.active {
    background: var(--c-accent);
    border-color: var(--c-accent);
  }

  .toggle-circle {
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 1px;
    left: 1px;
    transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .toggle-btn.active .toggle-circle {
    transform: translateX(20px);
  }

  .select-wrapper {
    position: relative;
    max-width: 150px;
  }

  select {
    appearance: none;
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    color: var(--c-text-primary);
    padding: 6px 30px 6px 12px;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    width: 100%;
    text-overflow: ellipsis;
  }

  .select-arrow {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    width: 16px;
    height: 16px;
    color: var(--c-text-muted);
  }
  .select-arrow :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
