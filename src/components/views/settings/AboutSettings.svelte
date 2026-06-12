<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  const appVersion =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";
  const buildDateRaw =
    typeof __BUILD_DATE__ !== "undefined"
      ? __BUILD_DATE__
      : new Date().toISOString();
  const buildDate = new Date(buildDateRaw).toLocaleString();
</script>

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

  .separator {
    height: 1px;
    background: var(--c-border);
    opacity: 0.5;
    margin: 4px 0;
  }
</style>
