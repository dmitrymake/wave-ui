<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import Card from "../../ui/Card.svelte";
  const appVersion =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";
  const buildDateRaw =
    typeof __BUILD_DATE__ !== "undefined"
      ? __BUILD_DATE__
      : new Date().toISOString();
  // "28 Sep 2026, 21:35" in the reader's own order, not "9/28/2026, 9:35:00 PM".
  const buildDate = new Date(buildDateRaw).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
</script>

<div class="section">
  <div class="section-header">
    <span>About</span>
  </div>
  <Card>
    <div class="row space-between">
      <span class="row-label">Version</span>
      <!-- The one technical string in settings keeps the mono face; neither
           value is boxed any more — they are values like every other. -->
      <span class="row-value mono">{appVersion}</span>
    </div>
    <div class="separator"></div>
    <div class="row space-between">
      <span class="row-label">Build Date</span>
      <span class="row-value">{buildDate}</span>
    </div>
  </Card>
</div>

<style>
  /* .section / .section-header live in settings.css (they were copied into all
     five sections). */

  .mono {
    font-family: var(--font-mono);
  }

</style>
