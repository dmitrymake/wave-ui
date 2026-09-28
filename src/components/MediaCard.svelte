<!--
  MediaCard — the square-cover card used by every grid in the app (playlists,
  library, search, radio, Yandex dashboard/search/artist pages).

  Eleven of these were written out by hand, which is where the drift came from:
  the same role="button" + tabindex + Enter/Space handler appeared twelve times,
  the play overlay was spelled slightly differently in each, and clicking the
  "more actions" chip on a playlist card also opened the playlist behind it.

  The class names stay exactly as MusicViews.css expects them (.music-card,
  .card-img-container, .card-title, .card-sub-row, .play-overlay), so the shared
  stylesheet keeps doing the styling and this component owns only the structure
  and the behaviour.

  Why not a real <button>? The cover can hold its own control (the menu chip),
  and interactive content inside a button is invalid and unusable.

  cover: what fills the square (image, dashed placeholder, icon).
  coverExtra: anything that floats on top of it (menu chip, status badge).
  sub: the line under the title. Skipped entirely when absent.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { ICONS } from "../lib/icons";
  import { longpress } from "../lib/actions";

  interface Props {
    cover: Snippet;
    title?: string;
    /** Left-aligned like the playlist/library cards. */
    titleCenter?: boolean;
    sub?: Snippet;
    coverExtra?: Snippet;
    /** The dim "tap to play" overlay. Off for cards that are not playable. */
    playable?: boolean;
    /** Extra classes on the cover itself (dashed-cover, is-vibe, ...). */
    coverClass?: string;
    coverStyle?: string;
    active?: boolean;
    onactivate?: () => void;
    /** Wired to both the context menu event and a long press. */
    oncontextmenu?: (event: MouseEvent) => void;
    class?: string;
  }

  let {
    cover,
    title,
    titleCenter = false,
    sub,
    coverExtra,
    playable = true,
    coverClass = "",
    coverStyle = "",
    active = false,
    onactivate,
    oncontextmenu,
    class: className = "",
  }: Props = $props();

  function handleClick(event: MouseEvent) {
    // A control on the cover is its own action: without this, tapping the card's
    // "more actions" chip opened the menu AND the playlist behind it.
    if ((event.target as HTMLElement).closest("button, a")) return;
    onactivate?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onactivate?.();
  }
</script>

<div
  class="music-card {className}"
  class:is-active={active}
  role="button"
  tabindex="0"
  onclick={handleClick}
  onkeydown={handleKeydown}
  oncontextmenu={(e) => oncontextmenu?.(e)}
  use:longpress={{ enabled: Boolean(oncontextmenu) }}
  onlongpress={(e) => oncontextmenu?.(e.detail.originalEvent as MouseEvent)}
>
  <div class="card-img-container {coverClass}" style={coverStyle}>
    {@render cover()}

    {#if coverExtra}
      <div class="cover-extra">{@render coverExtra()}</div>
    {/if}

    {#if playable}
      <div class="play-overlay">
        <span class="overlay-icon">{@html ICONS.PLAY}</span>
      </div>
    {/if}
  </div>

  {#if title}
    <div class="card-title" class:center={titleCenter} {title}>{title}</div>
  {/if}

  {#if sub}
    <div class="card-sub-row">
      {@render sub()}
    </div>
  {/if}
</div>

<style>
  /* Whatever the caller floats on the cover (a menu chip, a status badge) goes
     in this layer. The cover is a grid, so a second child would have been placed
     in its own row under the artwork instead of on top of it. Taps pass through
     the layer; the controls inside it take their own. */
  .cover-extra {
    position: absolute;
    inset: var(--space-0);
    z-index: var(--z-overlay-local);
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .cover-extra :global(button) {
    pointer-events: auto;
  }
</style>
