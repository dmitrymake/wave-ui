<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import { fade } from "svelte/transition";
  import { MOTION } from "../../../lib/transitions";
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
  <Card>
    <div class="row space-between">
      <span class="row-label">Enable Yandex Music (Beta)</span>
      <Toggle
        checked={$isYandexEnabled}
        ariaLabel="Enable Yandex Music"
        onchange={(c) => isYandexEnabled.set(c)}
      />
    </div>

    {#if $isYandexEnabled}
      <div class="separator" in:fade={{ duration: MOTION.fast }}></div>

      <div class="row space-between" in:fade={{ duration: MOTION.fast }}>
        <span class="row-label">Connection Status</span>
        {#if $yandexAuthStatus}
          <span class="badge badge--success">Connected</span>
        {:else}
          <span class="badge badge--danger">Not Connected</span>
        {/if}
      </div>

      <div class="separator" in:fade={{ duration: MOTION.fast }}></div>

      <div class="row" in:fade={{ duration: MOTION.fast }}>
        <span class="row-label">OAuth Token</span>
        <div class="input-group">
          <Input
            type="password"
            bind:value={inputToken}
            placeholder="Paste token here…"
            ariaLabel="OAuth Token"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={isChecking}
            onclick={handleSaveToken}
          >
            {isChecking ? "Checking…" : "Save"}
          </Button>
        </div>
      </div>

      <p class="hint" in:fade={{ duration: MOTION.fast }}>Token is stored securely on the device.</p>

      {#if $yandexAuthStatus}
        <div class="separator" in:fade={{ duration: MOTION.fast }}></div>
        <div class="row space-between" in:fade={{ duration: MOTION.fast }}>
          <span class="row-label">Diagnostics</span>
          <!-- Secondary: the accent fill is for the one action that commits
               something (Save). Show / Refresh / Copy only look. -->
          <Button variant="secondary" size="sm" onclick={toggleDiag}>
            {diagOpen ? "Hide" : "Show"}
          </Button>
        </div>

        {#if diagOpen}
          <div class="diag-box" in:fade={{ duration: MOTION.fast }}>
            {#if diagLoading}
              <span class="hint">Loading…</span>
            {:else}
              <pre class="diag-pre">{diagText}</pre>
              <div class="row-gap">
                <Button variant="secondary" size="sm" onclick={loadDiagnostics}>
                  Refresh
                </Button>
                <Button variant="secondary" size="sm" onclick={copyDiagnostics}>
                  Copy
                </Button>
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    {/if}
  </Card>
</div>

<style>
  /* .section / .section-header live in settings.css (they were copied into all
     five sections). */

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

  /* The connection state is the shared .badge (--success / --danger). */
</style>
