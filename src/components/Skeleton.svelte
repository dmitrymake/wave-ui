<script>
  export let width = "100%";
  export let height = "20px";
  export let radius = "4px";
  export let style = "";
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
      opacity: 0.6;
    }
    50% {
      opacity: 0.3;
    }
    100% {
      opacity: 0.6;
    }
  }
</style>
