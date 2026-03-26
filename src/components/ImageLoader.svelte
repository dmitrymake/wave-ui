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

  let status = $state<"loading" | "loaded" | "error">("loading");

  // reset on src change
  $effect(() => {
    if (src) status = "loading";
    else status = "error";
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
    inset: 0;
    z-index: 2;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0;
    transition: opacity 0.3s ease-in;
    position: absolute;
    inset: 0;
    z-index: 1;
  }
  img.vis {
    opacity: 1;
  }
</style>
