<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 dmitrymake -->
<script lang="ts">
  let { label = "Loading audio", size = "var(--icon-size-md)" }: { label?: string; size?: string } = $props();
</script>

<span class="playback-spinner" role="status" aria-label={label} style:width={size} style:height={size}></span>

<style>
  .playback-spinner {
    display: inline-block;
    box-sizing: border-box;
    flex-shrink: 0;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: var(--radius-circle);
    animation: playback-spin 800ms linear infinite;
  }
  @keyframes playback-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .playback-spinner { animation-duration: 3s; }
  }
</style>
