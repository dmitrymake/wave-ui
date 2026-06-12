<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { showToast } from "../../../lib/store";
  import { isYandexEnabled, yandexAuthStatus } from "../../../lib/stores/yandex";
  import { YandexService } from "../../../lib/yandexService";

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

  function toggleYandex() {
    isYandexEnabled.update((v) => !v);
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
      <label for="toggle-yandex">Enable Yandex Music (Beta)</label>
      <button
        id="toggle-yandex"
        class="toggle-btn"
        class:active={$isYandexEnabled}
        onclick={toggleYandex}
        aria-pressed={$isYandexEnabled}
        aria-label="Enable Yandex Music"
      >
        <div class="toggle-circle"></div>
      </button>
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
        <label for="yandex-token">OAuth Token</label>
        <div class="input-group">
          <input
            id="yandex-token"
            type="password"
            bind:value={inputToken}
            placeholder="Paste token here..."
          />
          <button
            class="btn-primary small"
            disabled={isChecking}
            onclick={handleSaveToken}
          >
            {isChecking ? "Checking..." : "Save"}
          </button>
        </div>
      </div>

      <p class="hint" in:fade>Token is stored securely on the device.</p>

      {#if $yandexAuthStatus}
        <div class="separator" in:fade></div>
        <div class="row space-between" in:fade>
          <span class="label-text">Diagnostics</span>
          <button class="btn-primary small" onclick={toggleDiag}>
            {diagOpen ? "Hide" : "Show"}
          </button>
        </div>

        {#if diagOpen}
          <div class="diag-box" in:fade>
            {#if diagLoading}
              <span class="hint">Loading…</span>
            {:else}
              <pre class="diag-pre">{diagText}</pre>
              <div class="row-gap">
                <button class="btn-primary small" onclick={loadDiagnostics}
                  >Refresh</button
                >
                <button class="btn-primary small" onclick={copyDiagnostics}
                  >Copy</button
                >
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
  .row.space-between {
    justify-content: space-between;
    width: 100%;
  }
  .row-gap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  label,
  .label-text {
    font-size: 14px;
    color: var(--c-text-secondary);
    font-weight: 600;
  }

  .input-group {
    display: flex;
    gap: 8px;
    flex: 1;
  }

  input[type="password"] {
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

  .separator {
    height: 1px;
    background: var(--c-border);
    opacity: 0.5;
    margin: 4px 0;
  }

  .toggle-btn {
    width: 44px;
    height: 24px;
    background: var(--c-surface-input);
    border-radius: 12px;
    border: 1px solid var(--c-border);
    position: relative;
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s;
    padding: 0;
  }

  .toggle-btn.active {
    background: var(--c-accent);
    border-color: var(--c-accent);
  }

  .toggle-circle {
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 1px;
    left: 1px;
    transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .toggle-btn.active .toggle-circle {
    transform: translateX(20px);
  }

  .diag-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }
  .diag-pre {
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    color: var(--c-text-primary);
    padding: 10px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 11px;
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }

  .status-badge {
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: bold;
  }
  .connected {
    background: rgba(46, 204, 113, 0.2);
    color: #2ecc71;
  }
  .disconnected {
    background: rgba(231, 76, 60, 0.2);
    color: #e74c3c;
  }
</style>
