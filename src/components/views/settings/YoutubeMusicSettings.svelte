<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 dmitrymake -->
<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import Toggle from "../../ui/Toggle.svelte";
  import Button from "../../ui/Button.svelte";
  import { YoutubeApi } from "../../../lib/youtube";
  import { YoutubeService } from "../../../lib/youtubeService";
  import { isYoutubeEnabled, youtubeStatus, youtubeSettingsVersion } from "../../../lib/stores/youtube";
  import { showToast } from "../../../lib/store";

  let auth = $state("");
  let busy = $state(false);
  let loading = $state(false);
  let settingsLoaded = $state(false);
  let error = $state("");
  let hideAiKeywords = $state(false);
  let keywords = $state("");
  let blockedArtists = $state("");
  let savingFilters = $state(false);
  let loadSequence = 0;

  $effect(() => {
    const enabled = $isYoutubeEnabled;
    if (enabled) void loadConnection();
    return () => { loadSequence++; };
  });

  async function loadConnection() {
    const seq = ++loadSequence;
    loading = true;
    error = "";
    settingsLoaded = false;
    const [status, settings] = await Promise.allSettled([YoutubeApi.status(), YoutubeApi.settings()]);
    if (seq !== loadSequence) return;
    if (status.status === "fulfilled") youtubeStatus.set(status.value);
    else {
      youtubeStatus.set({ authorized: false, playbackReady: false });
      error = status.reason instanceof Error ? status.reason.message : "YouTube Music bridge is unavailable";
    }
    if (settings.status === "fulfilled") {
      hideAiKeywords = settings.value.hideAiKeywords;
      keywords = settings.value.aiKeywords.join("\n");
      blockedArtists = settings.value.blockedArtists.join("\n");
      settingsLoaded = true;
    } else if (!error) {
      error = "Could not load YouTube Music filter settings";
    }
    loading = false;
  }

  async function connect() {
    if (!auth.trim() || busy) return;
    busy = true;
    try {
      if (await YoutubeService.saveAuth(auth)) { auth = ""; error = ""; }
    } finally { busy = false; }
  }

  async function disconnect() {
    busy = true;
    try {
      await YoutubeService.disconnect();
      auth = "";
      showToast("YouTube Music disconnected", "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not disconnect YouTube Music", "error");
    } finally { busy = false; }
  }

  function entries(value: string): string[] {
    return [...new Set(value.split("\n").map((line) => line.trim()).filter(Boolean))];
  }

  async function saveFilters() {
    savingFilters = true;
    try {
      await YoutubeApi.saveSettings({ hideAiKeywords, aiKeywords: entries(keywords), blockedArtists: entries(blockedArtists) });
      youtubeSettingsVersion.update((value) => value + 1);
      showToast("YouTube Music filters saved", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save filters", "error");
    } finally { savingFilters = false; }
  }
</script>

<div class="youtube-settings">
  <Card>
    <div class="row space-between">
      <span class="row-label">Enable YouTube Music (Beta)</span>
      <Toggle checked={$isYoutubeEnabled} ariaLabel="Enable YouTube Music" onchange={(value) => isYoutubeEnabled.set(value)} />
    </div>
    {#if $isYoutubeEnabled}
      <div class="separator"></div>
      <div class="row space-between">
        <span class="row-label">Connection Status</span>
        <span class="badge" class:badge--success={$youtubeStatus.authorized} class:badge--danger={!$youtubeStatus.authorized}>
          {loading ? "Checking…" : $youtubeStatus.authorized ? "Connected" : "Not Connected"}
        </span>
      </div>
      {#if $youtubeStatus.accountName}<p class="hint">{$youtubeStatus.accountName}</p>{/if}
      {#if error}
        <p class="error" role="alert">{error}</p>
        <Button variant="secondary" size="sm" disabled={loading} onclick={loadConnection}>Retry connection</Button>
      {/if}
      <div class="separator"></div>
      <label class="row-label" for="youtube-auth">Browser session</label>
      <textarea id="youtube-auth" bind:value={auth} rows="3" spellcheck="false" autocomplete="off"
        placeholder="Paste browser.json or authenticated request headers…" disabled={busy}></textarea>
      <div class="row-gap">
        <Button variant="primary" size="sm" disabled={busy || !auth.trim()} onclick={connect}>
          {busy ? "Checking…" : "Connect"}
        </Button>
        {#if $youtubeStatus.authorized}
          <Button variant="secondary" size="sm" disabled={busy} onclick={disconnect}>Disconnect</Button>
        {/if}
      </div>
      <p class="hint">
        Use the headers of a signed-in request from music.youtube.com or a browser.json file.
        The session is saved only on the moOde device.
        <a href="https://ytmusicapi.readthedocs.io/en/stable/setup/browser.html" target="_blank" rel="noreferrer">Connection instructions</a>
      </p>
      {#if $youtubeStatus.authorized && !$youtubeStatus.playbackReady}
        <p class="error" role="status">Browsing is connected. Playback needs Deno 2.3+ or Node.js 22+ installed on moOde.</p>
      {/if}
      <div class="separator"></div>
      <div class="row space-between">
        <span class="row-label">Hide tracks by AI keywords</span>
        <Toggle checked={hideAiKeywords} ariaLabel="Hide tracks by AI keywords" disabled={!settingsLoaded}
          onchange={(value) => hideAiKeywords = value} />
      </div>
      <p class="hint">Matches text in titles, descriptions and artist names. This cannot reliably identify all AI music and may hide human-made tracks.</p>
      {#if hideAiKeywords}
        <label class="row-label" for="youtube-keywords">AI keywords — one per line</label>
        <textarea id="youtube-keywords" bind:value={keywords} rows="4" spellcheck="false" disabled={!settingsLoaded}></textarea>
      {/if}
      <label class="row-label" for="youtube-blocked-artists">Blocked artists — one name or channel ID per line</label>
      <textarea id="youtube-blocked-artists" bind:value={blockedArtists} rows="3" spellcheck="false" disabled={!settingsLoaded}
        placeholder="Exact artist name or YouTube channel ID"></textarea>
      <p class="hint">Blocks apply to search, recommendations, playlists and track radio. Existing queue items stay in the queue.</p>
      <Button variant="secondary" size="sm" disabled={!settingsLoaded || savingFilters} onclick={saveFilters}>
        {savingFilters ? "Saving…" : "Save filters"}
      </Button>
    {/if}
  </Card>
</div>

<style>
  .youtube-settings { margin-top: var(--space-4); }
  textarea {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    resize: vertical;
    background: var(--c-surface-input);
    color: var(--c-text-primary);
    border: var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    font: var(--text-sm) var(--font-mono);
  }
  textarea:focus-visible { outline: var(--border-width-thin) solid var(--c-accent); outline-offset: var(--space-1); }
  textarea:disabled { opacity: var(--opacity-muted); }
  .error { color: var(--c-error); font-size: var(--text-sm); margin: 0; }
  a { color: var(--c-accent-btn); }
</style>
