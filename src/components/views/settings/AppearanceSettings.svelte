<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { showToast, showModal, currentTheme } from "../../../lib/store";
  import { MSG } from "../../../lib/messages";
  import { THEMES } from "../../../lib/theme";
  import { ICONS } from "../../../lib/icons";

  function openThemeSelector() {
    const options = THEMES.map((t) => ({ label: t.label, value: t.id }));

    showModal({
      title: "Select Theme",
      message: "Choose your preferred interface style:",
      type: "select",
      inputValue: $currentTheme,
      options: options,
      onConfirm: (val) => {
        currentTheme.set(val ?? $currentTheme);
        showToast(MSG.SETTINGS_THEME_UPDATED, "success");
      },
    });
  }

  let activeThemeLabel = $derived(
    THEMES.find((t) => t.id === $currentTheme)?.label || "Default");
</script>

<div class="section">
  <div class="section-header">
    <span>Appearance</span>
  </div>
  <div class="card clickable" onclick={openThemeSelector} role="button" tabindex="0" onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openThemeSelector(); } }}>
    <div class="row space-between">
      <span>Interface Theme</span>
      <div class="row-gap">
        <span class="value">{activeThemeLabel}</span>
        <span class="chevron">{@html ICONS.NEXT}</span>
      </div>
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

  .card.clickable {
    cursor: pointer;
    transition: background var(--dur-fast);
  }
  .card.clickable:active {
    background: var(--c-surface-hover);
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
  .row-gap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .value {
    color: var(--c-text-secondary);
    font-size: var(--text-base);
  }

  .chevron {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    color: var(--c-text-muted);
    display: flex;
  }
  .chevron :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
