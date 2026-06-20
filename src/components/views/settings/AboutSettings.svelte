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

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-1) var(--space-0);
    font-size: var(--text-base);
    color: var(--c-text-primary);
  }
  .mono {
    font-family: var(--font-mono);
    background: var(--c-surface-hover);
    padding: var(--space-0_5) var(--space-1);
    border-radius: var(--radius-sm);
  }
  .mono.small {
    font-size: var(--text-sm);
  }

  .separator {
    height: var(--space-px);
    background: var(--c-border);
    opacity: var(--opacity-faint);
    margin: var(--space-1) var(--space-0);
  }
</style>
