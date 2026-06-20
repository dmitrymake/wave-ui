<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { YandexService } from "../../lib/yandexService";
  import ServicesSettings from "./settings/ServicesSettings.svelte";
  import AlarmSettings from "./settings/AlarmSettings.svelte";
  import AppearanceSettings from "./settings/AppearanceSettings.svelte";
  import ConnectionSettings from "./settings/ConnectionSettings.svelte";
  import AboutSettings from "./settings/AboutSettings.svelte";

  onMount(() => {
    YandexService.checkYandexAuth();
  });
</script>

<div class="view-container scrollable" in:fade={{ duration: 200 }}>
  <div class="content-padded">
    <h1 class="header-title big">Settings</h1>

    <ServicesSettings />

    <AlarmSettings />

    <AppearanceSettings />

    <ConnectionSettings />

    <AboutSettings />
  </div>
</div>

<style>
  .header-title.big {
    font-size: var(--text-5xl);
    margin-bottom: var(--space-6);
    padding-left: var(--space-1);
  }
</style>
