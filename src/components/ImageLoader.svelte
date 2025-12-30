<script>
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import Skeleton from "./Skeleton.svelte";

  export let src;
  export let alt = "";
  export let radius = "0px";

  const dispatch = createEventDispatcher();
  let status = "loading";

  // reset on src change
  $: if (src) status = "loading";
  else status = "error";

  function onLoad() {
    status = "loaded";
  }
  function onError(e) {
    dispatch("error", e);
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
      on:load={onLoad}
      on:error={onError}
      class:vis={status === "loaded"}
      style="border-radius: {radius}"
    />
  {/if}

  {#if status === "error"}
    <slot name="fallback" />
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
