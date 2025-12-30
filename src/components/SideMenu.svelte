<script>
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import logo from "../assets/wave-logo.svg";
  import { ICONS } from "../lib/icons";
  import { activeMenuTab, isSyncingLibrary } from "../lib/store";
  import { ApiActions } from "../lib/api";
  import { CONFIG } from "../config";

  export let isOpen = false;
  const dispatch = createEventDispatcher();

  // swipe logic
  let touchStartX = 0;
  let touchCurrentX = 0;
  let isSwiping = false;

  const MENU_ITEMS = [
    { id: "queue", label: "Queue", icon: ICONS.MENU },
    { id: "favorites", label: "Favorites", icon: ICONS.HEART },
    { id: "artists", label: "Artists", icon: ICONS.ARTISTS },
    { id: "albums", label: "Albums", icon: ICONS.ALBUMS },
    { id: "playlists", label: "Playlists", icon: ICONS.PLAYLISTS },
    { id: "radio", label: "Radio", icon: ICONS.RADIO },
  ];

  let ipAddress = CONFIG.MOODE_IP;

  function switchTab(id) {
    window.location.hash = `/${id}`;
    dispatch("close");
  }

  async function handleSync() {
    if ($isSyncingLibrary) return;
    await ApiActions.syncLibrary();
    window.location.hash = "/artists";
  }

  function handleTouchStart(e) {
    if (!isOpen) return;
    touchStartX = e.touches[0].clientX;
    touchCurrentX = touchStartX;
    isSwiping = true;
  }

  function handleTouchMove(e) {
    if (!isSwiping) return;
    touchCurrentX = e.touches[0].clientX;
  }

  function handleTouchEnd() {
    if (!isSwiping) return;
    if (touchCurrentX - touchStartX < -70) dispatch("close");
    isSwiping = false;
    touchStartX = 0;
    touchCurrentX = 0;
  }

  $: translateX = isSwiping ? Math.min(0, touchCurrentX - touchStartX) : 0;
</script>

{#if isOpen}
  <div
    class="backdrop"
    on:click={() => dispatch("close")}
    transition:fade={{ duration: 200 }}
  ></div>
{/if}

<aside
  class="side-menu"
  class:mobile-open={isOpen}
  style:transform={isOpen ? `translateX(${translateX}px)` : ""}
  style:transition={isSwiping ? "none" : "transform 0.3s ease"}
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
>
  <div class="header">
    <img src={logo} alt="Logo" class="logo" />
    <button class="btn-icon mobile-close" on:click={() => dispatch("close")}>
      {@html ICONS.CLOSE}
    </button>
  </div>

  <div class="scroll-area scroll-y">
    <nav>
      {#each MENU_ITEMS as item}
        <button
          class="nav-item"
          class:active={$activeMenuTab === item.id}
          on:click={() => switchTab(item.id)}
        >
          <span class="icon">{@html item.icon}</span>
          <span>{item.label}</span>
        </button>
      {/each}

      <button
        class="nav-item"
        class:active={$activeMenuTab === "search"}
        on:click={() => switchTab("search")}
      >
        <span class="icon">{@html ICONS.SEARCH}</span>
        <span>Search</span>
      </button>

      <div class="sep"></div>

      <button
        class="nav-item sync"
        disabled={$isSyncingLibrary}
        on:click={handleSync}
      >
        <span class="icon" class:spin={$isSyncingLibrary}
          >{@html ICONS.SYNC}</span
        >
        <span>{$isSyncingLibrary ? "Syncing..." : "Update Library"}</span>
      </button>
    </nav>

    <div class="settings">
      <div class="sep"></div>
      <div class="label">MPD Server IP</div>
      <div class="row">
        <input type="text" bind:value={ipAddress} placeholder="192.168..." />
        <button
          class="save"
          on:click={() => {
            CONFIG.setMoodeIp(ipAddress);
            location.reload();
          }}>Save</button
        >
      </div>
      <div class="footer">Moode WaveUI</div>
    </div>
  </div>
</aside>

<style>
  .side-menu {
    width: var(--sidebar-width);
    height: 100dvh;
    background: var(--c-bg-sidebar);
    border-right: 1px solid var(--c-border);
    display: flex;
    flex-direction: column;
    z-index: var(--z-modal);
    transition: transform 0.3s ease;
  }

  .scroll-area {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .header {
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .logo {
    height: 50px;
    filter: drop-shadow(0 0 10px var(--c-shadow-glow-accent));
  }
  .mobile-close {
    display: none;
    position: absolute;
    right: 15px;
    color: var(--c-text-primary);
  }

  nav {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 12px 16px;
    color: var(--c-text-muted);
    font-size: 16px;
    font-weight: 600;
    border-radius: 8px;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .nav-item:hover {
    background: var(--c-surface-hover);
    color: var(--c-text-primary);
  }
  .nav-item.active {
    background: var(--c-accent);
    color: var(--c-text-primary);
  }

  .icon {
    margin-right: 14px;
    display: flex;
  }
  .icon :global(svg) {
    width: 22px;
    height: 22px;
  }

  .sep {
    height: 1px;
    background: var(--c-border);
    margin: 15px 10px;
  }
  .spin {
    animation: rotate 2s linear infinite;
  }
  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .settings {
    padding: 0 15px 20px;
  }
  .label {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--c-text-secondary);
    margin-bottom: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
  }

  input {
    flex: 1;
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    color: var(--c-text-primary);
    padding: 8px;
    border-radius: 6px;
    outline: none;
    width: 80px;
  }
  .save {
    background: var(--c-surface-button);
    border: 1px solid var(--c-border);
    color: var(--c-text-primary);
    padding: 0 12px;
    border-radius: 6px;
    cursor: pointer;
  }
  .save:hover {
    background: var(--c-surface-hover);
  }

  .footer {
    font-size: 10px;
    color: var(--c-text-muted);
    text-align: center;
    margin-top: 15px;
  }

  @media (max-width: 768px) {
    .side-menu {
      position: fixed;
      left: 0;
      top: 0;
      transform: translateX(-100%);
    }
    .side-menu.mobile-open {
      transform: translateX(0);
    }
    .mobile-close {
      display: flex;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      background: var(--c-overlay-backdrop);
      z-index: 999;
      backdrop-filter: blur(4px);
    }
  }
</style>
