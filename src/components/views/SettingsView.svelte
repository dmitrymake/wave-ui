<script>
  import { fade } from "svelte/transition";
  import { CONFIG } from "../../config";
  import { showToast } from "../../lib/store";
  import { ICONS } from "../../lib/icons";

  let ipAddress = CONFIG.MOODE_IP;

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

  function handleFeatureNotReady() {
    showToast("Coming soon in next update", "info");
  }
</script>

<div class="view-container scrollable" in:fade={{ duration: 200 }}>
  <div class="content-padded">
    <h1 class="header-title big">Settings</h1>

    <div class="section">
      <div class="section-header">
        <span class="icon-svg">{@html ICONS.SETTINGS || ICONS.MENU}</span>
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
        <span>Alarm Clock</span>
      </div>
      <div class="card clickable" on:click={handleFeatureNotReady}>
        <div class="row space-between">
          <span>Wake up time</span>
          <span class="value">Coming Soon</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <span>Appearance</span>
      </div>
      <div class="card clickable" on:click={handleFeatureNotReady}>
        <div class="row space-between">
          <span>Theme</span>
          <span class="value">Dark (Default)</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <span>Language</span>
      </div>
      <div class="card clickable" on:click={handleFeatureNotReady}>
        <div class="row space-between">
          <span>Interface Language</span>
          <span class="value">English</span>
        </div>
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
        <div class="separator"></div>
        <div class="info-row">
          <span>Developer</span>
          <span>Moode WaveUI</span>
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

  .icon-svg {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }
  .icon-svg :global(svg) {
    width: 100%;
    height: 100%;
  }

  .card {
    background: var(--c-surface);
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

  label {
    font-size: 14px;
    color: var(--c-text-secondary);
    font-weight: 600;
  }

  .input-group {
    display: flex;
    gap: 8px;
    flex: 1;
  }

  input[type="text"] {
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    color: var(--c-text-primary);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    flex: 1;
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
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .mono.small {
    font-size: 12px;
  }

  .separator {
    height: 1px;
    background: var(--c-border);
    opacity: 0.5;
    margin: 4px 0;
  }
</style>
