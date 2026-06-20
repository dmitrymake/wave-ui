<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { CONFIG } from "../../../config";
  import { showToast } from "../../../lib/store";
  import { MSG } from "../../../lib/messages";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";

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
      <span class="row-label">Moode Device IP</span>
      <div class="input-group">
        <Input
          type="text"
          bind:value={ipAddress}
          placeholder="192.168.x.x"
          size="sm"
          ariaLabel="Moode Device IP"
        />
        <Button variant="primary" size="sm" onclick={saveConnection}>Save</Button>
      </div>
    </div>
    <p class="hint">Current: {CONFIG.MOODE_IP}</p>
  </div>
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

  .card {
    background: var(--c-bg-card);
    border: var(--border-default);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .row-label {
    font-size: var(--text-base);
    color: var(--c-text-secondary);
    font-weight: var(--weight-semibold);
  }

  .input-group {
    display: flex;
    gap: var(--space-2);
    flex: 1;
  }

  .hint {
    font-size: var(--text-sm);
    color: var(--c-text-muted);
    margin: var(--space-1) 0 0;
  }
</style>
