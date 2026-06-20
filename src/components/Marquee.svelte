<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<!--
  Marquee — gently scrolls overflowing single-line text (song title / artist) so the
  full string is readable, Spotify-style: dwell, scroll to the end, dwell, scroll back.
  When the text fits, it renders as a normal ellipsised line (no animation). Measurement
  is defensive (jsdom returns 0 widths -> treated as "fits", no animation).
-->
<script lang="ts">
  interface Props {
    text: string;
    /** scroll speed, px per second */
    speed?: number;
    class?: string;
  }
  let { text, speed = 40, class: className = "" }: Props = $props();

  let container = $state<HTMLElement>();
  let content = $state<HTMLElement>();
  let overflow = $state(0);
  let duration = $state(0);

  function measure() {
    const c = container;
    const t = content;
    if (!c || !t) return;
    const o = t.scrollWidth - c.clientWidth;
    overflow = o > 2 ? o : 0;
    // dwell at both ends is baked into the keyframe (~30% of the cycle), so add a
    // couple of seconds on top of the pure travel time for a calm, readable pace.
    duration = overflow > 0 ? Math.max(5, overflow / speed + 2) : 0;
  }

  // Re-measure when the text changes (new track).
  $effect(() => {
    void text;
    if (typeof requestAnimationFrame === "undefined") return;
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  });

  // Re-measure when the container resizes (rotation, sidebar collapse, window resize).
  $effect(() => {
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
  });
</script>

<span class="marquee" class:is-scrolling={overflow > 0} bind:this={container}>
  <span
    class="marquee__inner {className}"
    bind:this={content}
    style={overflow > 0
      ? `--marquee-shift: ${-overflow}px; --marquee-duration: ${duration}s;`
      : ""}>{text}</span>
</span>

<style>
  .marquee {
    display: block;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }

  .marquee__inner {
    display: inline-block;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: top;
  }

  .marquee.is-scrolling .marquee__inner {
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    animation: marquee-scroll var(--marquee-duration) var(--ease-emphasized) infinite alternate;
    animation-delay: 1s;
  }

  @keyframes marquee-scroll {
    0%, 15% {
      transform: translateX(0);
    }
    85%, 100% {
      transform: translateX(var(--marquee-shift));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .marquee.is-scrolling .marquee__inner {
      animation: none;
    }
  }
</style>
