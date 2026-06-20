<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import type { Snippet } from "svelte";
  import Skeleton from "./Skeleton.svelte";

  interface Props {
    src: string;
    alt?: string;
    radius?: string;
    onError?: (e: Event) => void;
    fallback?: Snippet;
  }

  let { src, alt = "", radius = "0px", onError: onErrorCallback, fallback }: Props = $props();

  let status = $state<"loading" | "loaded" | "error">(src ? "loading" : "error");
  let lastSrc = src;

  // reset only when src actually changes, not on initial mount
  $effect(() => {
    if (src !== lastSrc) {
      lastSrc = src;
      status = src ? "loading" : "error";
    }
  });

  function onLoad() {
    status = "loaded";
  }
  function onError(e: Event) {
    onErrorCallback?.(e);
    status = "error";
  }
</script>

<div class="loader" style="border-radius: {radius}">
  {#if status === "loading"}
    <div class="skel" out:fade={{ duration: 200 }}>
      <Skeleton width="100%" height="100%" {radius} />
    </div>
  {/if}

  {#if src && status !== "error"}
    <img
      {src}
      {alt}
      loading="lazy"
      onload={onLoad}
      onerror={onError}
      class:vis={status === "loaded"}
      style="border-radius: {radius}"
    />
  {/if}

  {#if status === "error"}
    {#if fallback}
      {@render fallback()}
    {/if}
  {/if}
</div>

<style>
  .loader {
    width: 100%;
    height: 100%;
    position: relative;
  }
  .skel {
    position: absolute;
    inset: var(--space-0);
    z-index: var(--z-above);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: var(--opacity-hidden);
    transition: opacity var(--dur-base) ease-in;
    position: absolute;
    inset: var(--space-0);
    z-index: var(--z-base);
  }
  img.vis {
    opacity: var(--opacity-visible);
  }
</style>
