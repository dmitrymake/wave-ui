<script>
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { CONFIG } from "../../config";
  import {
    showToast,
    showModal,
    currentTheme,
    alarmTime,
    isAlarmEnabled,
    alarmPlaylist,
    playlists,
    isYandexEnabled,
    yandexAuthStatus,
  } from "../../lib/store";
  import { ApiActions } from "../../lib/api";
  import { THEMES } from "../../lib/theme";
  import { ICONS } from "../../lib/icons";

  let ipAddress = CONFIG.MOODE_IP;
  let serverTime = "--:--";
  let timeInterval;
  let inputToken = "";
  let isChecking = false;

  function saveConnection() {
    CONFIG.setMoodeIp(ipAddress);
    showToast("IP Saved. Reloading...", "success");
    setTimeout(() => location.reload(), 1000);
  }

  const appVersion =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";
  const buildDateRaw =
    typeof __BUILD_DATE__ !== "undefined"
      ? __BUILD_DATE__
      : new Date().toISOString();
  const buildDate = new Date(buildDateRaw).toLocaleString();

  function openThemeSelector() {
    const options = THEMES.map((t) => ({ label: t.label, value: t.id }));

    showModal({
      title: "Select Theme",
      message: "Choose your preferred interface style:",
      type: "select",
      inputValue: $currentTheme,
      options: options,
      onConfirm: (val) => {
        currentTheme.set(val);
        showToast("Theme updated", "success");
      },
    });
  }

  async function fetchServerTime() {
    const t = await ApiActions.getServerTime();
    if (t) serverTime = t;
  }

  onMount(() => {
    fetchServerTime();
    timeInterval = setInterval(fetchServerTime, 60000);
    ApiActions.checkYandexAuth();
  });

  onDestroy(() => {
    if (timeInterval) clearInterval(timeInterval);
  });

  async function handleSaveAlarm() {
    try {
      await ApiActions.setAlarm($isAlarmEnabled, $alarmTime, $alarmPlaylist);
      if ($isAlarmEnabled) {
        showToast(`Alarm set for ${$alarmTime}`, "success");
      }
    } catch (e) {
      showToast("Failed to sync alarm settings", "error");
    }
  }

  function toggleAlarm() {
    isAlarmEnabled.update((v) => !v);
    handleSaveAlarm();
  }

  function toggleYandex() {
    isYandexEnabled.update((v) => !v);
  }

  async function handleSaveToken() {
    if (!inputToken) return;
    isChecking = true;
    const success = await ApiActions.saveYandexToken(inputToken);
    isChecking = false;
    if (success) {
      inputToken = "";
    }
  }

  $: activeThemeLabel =
    THEMES.find((t) => t.id === $currentTheme)?.label || "Default";
</script>

<div class="view-container scrollable" in:fade={{ duration: 200 }}>
  <div class="content-padded">
    <h1 class="header-title big">Settings</h1>

    <div class="section">
      <div class="section-header">
        <span>Services</span>
      </div>
      <div class="card">
        <div class="row space-between">
          <label>Enable Yandex Music (Beta)</label>
          <button
            class="toggle-btn"
            class:active={$isYandexEnabled}
            on:click={toggleYandex}
          >
            <div class="toggle-circle"></div>
          </button>
        </div>

        {#if $isYandexEnabled}
          <div class="separator" in:fade></div>

          <div class="row space-between" in:fade>
            <label>Connection Status</label>
            {#if $yandexAuthStatus}
              <span class="status-badge connected">Connected</span>
            {:else}
              <span class="status-badge disconnected">Not Connected</span>
            {/if}
          </div>

          <div class="separator" in:fade></div>

          <div class="row" in:fade>
            <label for="yandex-token">OAuth Token</label>
            <div class="input-group">
              <input
                id="yandex-token"
                type="password"
                bind:value={inputToken}
                placeholder="Paste token here..."
              />
              <button
                class="btn-primary small"
                disabled={isChecking}
                on:click={handleSaveToken}
              >
                {isChecking ? "Checking..." : "Save"}
              </button>
            </div>
          </div>

          <p class="hint" in:fade>Token is stored securely on the device.</p>
        {/if}
      </div>
    </div>

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
          <label>Enable Alarm</label>
          <button
            class="toggle-btn"
            class:active={$isAlarmEnabled}
            on:click={toggleAlarm}
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
              on:change={handleSaveAlarm}
            />
          </div>

          <div class="separator" in:fade></div>

          <div class="row space-between" in:fade>
            <label for="alarm-pl">Playlist</label>
            <div class="select-wrapper">
              <select
                id="alarm-pl"
                bind:value={$alarmPlaylist}
                on:change={handleSaveAlarm}
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

    <div class="section">
      <div class="section-header">
        <span>Appearance</span>
      </div>
      <div class="card clickable" on:click={openThemeSelector}>
        <div class="row space-between">
          <span>Interface Theme</span>
          <div class="row-gap">
            <span class="value">{activeThemeLabel}</span>
            <span class="chevron">{@html ICONS.NEXT}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <span>Connection</span>
      </div>
      <div class="card">
        <div class="row">
          <label for="ip">Moode Device IP</label>
          <div class="input-group">
            <input
              id="ip"
              type="text"
              bind:value={ipAddress}
              placeholder="192.168.x.x"
            />
            <button class="btn-primary small" on:click={saveConnection}
              >Save</button
            >
          </div>
        </div>
        <p class="hint">Current: {CONFIG.MOODE_IP}</p>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <span>About</span>
      </div>
      <div class="card">
        <div class="info-row">
          <span>Version</span>
          <span class="mono">{appVersion}</span>
        </div>
        <div class="separator"></div>
        <div class="info-row">
          <span>Build Date</span>
          <span class="mono small">{buildDate}</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  @import "../views/MusicViews.css";

  .header-title.big {
    font-size: 32px;
    margin-bottom: 24px;
    padding-left: 4px;
  }

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

  .card.clickable {
    cursor: pointer;
    transition: background 0.2s;
  }
  .card.clickable:active {
    background: var(--c-surface-hover);
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
  .row-gap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  label,
  .label-text {
    font-size: 14px;
    color: var(--c-text-secondary);
    font-weight: 600;
  }

  .input-group {
    display: flex;
    gap: 8px;
    flex: 1;
  }

  input[type="text"],
  input[type="password"] {
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    color: var(--c-text-primary);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    flex: 1;
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

  .btn-primary.small {
    padding: 0 16px;
    font-size: 13px;
    height: 36px;
  }

  .hint {
    font-size: 12px;
    color: var(--c-text-muted);
    margin: 4px 0 0;
  }

  .value {
    color: var(--c-text-secondary);
    font-size: 14px;
  }

  .chevron {
    width: 16px;
    height: 16px;
    color: var(--c-text-muted);
    display: flex;
  }
  .chevron :global(svg) {
    width: 100%;
    height: 100%;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: 14px;
    color: var(--c-text-primary);
  }
  .mono {
    font-family: monospace;
    background: var(--c-surface-hover);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .mono.small {
    font-size: 12px;
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

  .status-badge {
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: bold;
  }
  .connected {
    background: rgba(46, 204, 113, 0.2);
    color: #2ecc71;
  }
  .disconnected {
    background: rgba(231, 76, 60, 0.2);
    color: #e74c3c;
  }
</style>
