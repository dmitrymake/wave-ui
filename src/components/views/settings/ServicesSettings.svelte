<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { showToast } from "../../../lib/store";
  import { isYandexEnabled, yandexAuthStatus } from "../../../lib/stores/yandex";
  import { YandexService } from "../../../lib/yandexService";
  import Toggle from "../../ui/Toggle.svelte";
  import Input from "../../ui/Input.svelte";
  import Button from "../../ui/Button.svelte";

  let inputToken = $state("");
  let isChecking = $state(false);

  let diagOpen = $state(false);
  let diagLoading = $state(false);
  let diagText = $state("");

  async function loadDiagnostics() {
    diagLoading = true;
    try {
      const dump = await YandexService.getYandexDebugDump();
      diagText = JSON.stringify(dump, null, 2);
    } catch (e) {
      diagText = "Failed to load diagnostics: " + (e as Error).message;
    }
    diagLoading = false;
  }

  function copyDiagnostics() {
    if (!diagText) return;
    navigator.clipboard
      .writeText(diagText)
      .then(() => showToast("Diagnostics copied", "success"))
      .catch(() => showToast("Copy failed", "error"));
  }

  function toggleDiag() {
    diagOpen = !diagOpen;
    if (diagOpen && !diagText) loadDiagnostics();
  }

  async function handleSaveToken() {
    if (!inputToken) return;
    isChecking = true;
    const success = await YandexService.saveYandexToken(inputToken);
    isChecking = false;
    if (success) {
      inputToken = "";
    }
  }
</script>

<div class="section">
  <div class="section-header">
    <span>Services</span>
  </div>
  <div class="card">
    <div class="row space-between">
      <span class="label-text">Enable Yandex Music (Beta)</span>
      <Toggle
        checked={$isYandexEnabled}
        ariaLabel="Enable Yandex Music"
        onchange={(c) => isYandexEnabled.set(c)}
      />
    </div>

    {#if $isYandexEnabled}
      <div class="separator" in:fade></div>

      <div class="row space-between" in:fade>
        <span>Connection Status</span>
        {#if $yandexAuthStatus}
          <span class="status-badge connected">Connected</span>
        {:else}
          <span class="status-badge disconnected">Not Connected</span>
        {/if}
      </div>

      <div class="separator" in:fade></div>

      <div class="row" in:fade>
        <span class="label-text">OAuth Token</span>
        <div class="input-group">
          <Input
            type="password"
            bind:value={inputToken}
            placeholder="Paste token here..."
            ariaLabel="OAuth Token"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={isChecking}
            onclick={handleSaveToken}
          >
            {isChecking ? "Checking..." : "Save"}
          </Button>
        </div>
      </div>

      <p class="hint" in:fade>Token is stored securely on the device.</p>

      {#if $yandexAuthStatus}
        <div class="separator" in:fade></div>
        <div class="row space-between" in:fade>
          <span class="label-text">Diagnostics</span>
          <Button variant="primary" size="sm" onclick={toggleDiag}>
            {diagOpen ? "Hide" : "Show"}
          </Button>
        </div>

        {#if diagOpen}
          <div class="diag-box" in:fade>
            {#if diagLoading}
              <span class="hint">Loading…</span>
            {:else}
              <pre class="diag-pre">{diagText}</pre>
              <div class="row-gap">
                <Button variant="primary" size="sm" onclick={loadDiagnostics}>
                  Refresh
                </Button>
                <Button variant="primary" size="sm" onclick={copyDiagnostics}>
                  Copy
                </Button>
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    {/if}
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
  .row.space-between {
    justify-content: space-between;
    width: 100%;
  }
  .row-gap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .label-text {
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

  .separator {
    height: var(--space-px);
    background: var(--c-border);
    opacity: var(--opacity-faint);
    margin: var(--space-1) 0;
  }

  .diag-box {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .diag-pre {
    background: var(--c-surface-input);
    border: var(--border-default);
    color: var(--c-text-primary);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }

  .status-badge {
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-weight: var(--weight-bold);
  }
  .connected {
    background: color-mix(in srgb, var(--c-success) 18%, transparent);
    color: var(--c-success);
  }
  .disconnected {
    background: color-mix(in srgb, var(--c-error) 18%, transparent);
    color: var(--c-error);
  }
</style>
