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
    <!-- No <h1>Settings</h1> here: the top bar already shows the current
         section, and the duplicate heading cost a whole line of screen. The
         per-section headers (Services / Alarm Clock / …) carry the structure. -->

    <ServicesSettings />

    <AlarmSettings />

    <AppearanceSettings />

    <ConnectionSettings />

    <AboutSettings />
  </div>
</div>
