<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
    radius?: string;
    style?: string;
  }

  let { width = "100%", height = "20px", radius = "var(--radius-sm)", style = "" }: Props = $props();
</script>

<div
  class="skeleton"
  style="width: {width}; height: {height}; border-radius: {radius}; {style}"
></div>

<style>
  .skeleton {
    background: var(--c-skeleton-base);
    animation: pulse 1.5s infinite ease-in-out;
  }
  @keyframes pulse {
    0% {
      opacity: var(--opacity-muted);
    }
    50% {
      opacity: var(--opacity-ghost);
    }
    100% {
      opacity: var(--opacity-muted);
    }
  }
</style>
