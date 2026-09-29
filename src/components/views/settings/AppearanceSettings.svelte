<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import Card from "../../ui/Card.svelte";
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
  <Card clickable ariaLabel="Open theme selector" onclick={openThemeSelector}>
    <div class="row space-between">
      <span class="row-label">Interface Theme</span>
      <div class="row-gap">
        <span class="row-value">{activeThemeLabel}</span>
        <!-- A disclosure chevron: this row opens a chooser. It was the
             next-track glyph (▶|), which read as a transport control. -->
        <span class="chevron" aria-hidden="true">{@html ICONS.CHEVRON_RIGHT}</span>
      </div>
    </div>
  </Card>
</div>

<style>
  /* .section / .section-header live in settings.css (they were copied into all
     five sections). */

  .chevron {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    color: var(--c-text-muted);
    display: flex;
    flex-shrink: 0;
  }
  .chevron :global(svg) {
    width: 100%;
    height: 100%;
    stroke-width: var(--icon-stroke-width);
  }
  /* The value may be long ("Default (Moode Dark)") and the row narrow (the Pi):
     it truncates, the label and the chevron do not. */
  .row-gap {
    min-width: 0;
  }
  .row-gap .row-value {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-label {
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
