<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { CONFIG } from "../../../config";
  import { showToast } from "../../../lib/store";
  import { MSG } from "../../../lib/messages";

  let ipAddress = $state(CONFIG.MOODE_IP);
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  function saveConnection() {
    const ip = ipAddress.trim();
    // Validate before persisting: an empty/malformed value would point the app at
    // an unreachable backend with no UI recovery after the reload.
    if (!ip || !/^[a-zA-Z0-9.-]+(:\d+)?$/.test(ip)) {
      showToast(MSG.SETTINGS_IP_INVALID, "error");
      return;
    }
    if (ip === CONFIG.MOODE_IP) {
      showToast(MSG.SETTINGS_IP_SAVED, "success");
      return;
    }
    CONFIG.setMoodeIp(ip);
    showToast(MSG.SETTINGS_IP_SAVED, "success");
    reloadTimer = setTimeout(() => location.reload(), 1000);
  }

  onDestroy(() => {
    if (reloadTimer) clearTimeout(reloadTimer);
  });
</script>

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
        <button class="btn-primary small" onclick={saveConnection}
          >Save</button
        >
      </div>
    </div>
    <p class="hint">Current: {CONFIG.MOODE_IP}</p>
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
</style>
