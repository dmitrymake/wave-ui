<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import { onDestroy } from "svelte";
  import { CONFIG } from "../../../config";
  import { showToast } from "../../../lib/store";
  import { MSG } from "../../../lib/messages";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";

  let ipAddress = $state(CONFIG.MOODE_IP);
  let ipInvalid = $state(false);
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  function saveConnection() {
    const ip = ipAddress.trim();
    // Validate before persisting: an empty/malformed value would point the app at
    // an unreachable backend with no UI recovery after the reload.
    if (!ip || !/^[a-zA-Z0-9.-]+(:\d+)?$/.test(ip)) {
      // Mark the field, not just the toast: the toast is gone in 3s and the
      // field is what the user is looking at.
      ipInvalid = true;
      showToast(MSG.SETTINGS_IP_INVALID, "error");
      return;
    }
    ipInvalid = false;
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
  <Card>
    <div class="row">
      <span class="row-label">Moode Device IP</span>
      <div class="input-group">
        <Input
          type="text"
          bind:value={ipAddress}
          error={ipInvalid}
          placeholder="192.168.x.x"
          size="sm"
          ariaLabel="Moode Device IP"
        />
        <Button variant="primary" size="sm" onclick={saveConnection}>Save</Button>
      </div>
    </div>
    <p class="hint">Current: {CONFIG.MOODE_IP}</p>
  </Card>
</div>

<style>
  /* .section / .section-header live in settings.css (they were copied into all
     five sections). */

</style>
