<script>
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import logo from "../assets/wave-logo.svg?raw";
  import { ICONS } from "../lib/icons";
  import {
    activeMenuTab,
    isSyncingLibrary,
    isSidebarCollapsed,
  } from "../lib/store";
  import { ApiActions } from "../lib/api";

  export let isOpen = false;
  const dispatch = createEventDispatcher();

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

  function switchTab(id) {
    window.location.hash = `/${id}`;
    dispatch("close");
  }

  async function handleSync() {
    if ($isSyncingLibrary) return;
    await ApiActions.syncLibrary();
    window.location.hash = "/artists";
  }

  function toggleCollapse() {
    isSidebarCollapsed.update((v) => !v);
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
  class:collapsed={$isSidebarCollapsed}
  style:transform={isOpen ? `translateX(${translateX}px)` : ""}
  style:transition={isSwiping
    ? "none"
    : "width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.3s ease"}
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
>
  <div class="header">
    <div class="header-inner">
      <button
        class="collapse-btn"
        on:click={toggleCollapse}
        title={$isSidebarCollapsed ? "Expand" : "Collapse"}
      >
        <div
          class="chevron"
          style="transform: rotate({$isSidebarCollapsed ? '180deg' : '0deg'})"
        >
          {@html ICONS.BACK}
        </div>
      </button>

      <div class="logo-wrapper" class:hidden={$isSidebarCollapsed}>
        <div class="logo">
          {@html logo}
        </div>
      </div>
    </div>

    <button class="btn-icon mobile-close" on:click={() => dispatch("close")}>
      {@html ICONS.CLOSE}
    </button>
  </div>

  <div class="scroll-area custom-scrollbar">
    <nav>
      {#each MENU_ITEMS as item}
        <button
          class="nav-item"
          class:active={$activeMenuTab === item.id}
          title={item.label}
          on:click={() => switchTab(item.id)}
        >
          <span class="icon">{@html item.icon}</span>
          <span class="label-text" class:hidden={$isSidebarCollapsed}
            >{item.label}</span
          >
        </button>
      {/each}

      <button
        class="nav-item"
        class:active={$activeMenuTab === "search"}
        title="Search"
        on:click={() => switchTab("search")}
      >
        <span class="icon">{@html ICONS.SEARCH}</span>
        <span class="label-text" class:hidden={$isSidebarCollapsed}>Search</span
        >
      </button>

      <div class="sep"></div>

      <button
        class="nav-item sync"
        title="Update Library"
        disabled={$isSyncingLibrary}
        on:click={handleSync}
      >
        <span class="icon" class:spin={$isSyncingLibrary}
          >{@html ICONS.SYNC}</span
        >
        <span class="label-text" class:hidden={$isSidebarCollapsed}
          >{$isSyncingLibrary ? "Syncing..." : "Update Library"}</span
        >
      </button>

      <div class="sep"></div>

      <button
        class="nav-item"
        class:active={$activeMenuTab === "settings"}
        title="Settings"
        on:click={() => switchTab("settings")}
      >
        <span class="icon">{@html ICONS.SETTINGS}</span>
        <span class="label-text" class:hidden={$isSidebarCollapsed}
          >Settings</span
        >
      </button>
    </nav>

    <div class="footer">
      <div class="footer-text" class:hidden={$isSidebarCollapsed}>
        Moode WaveUI
      </div>
    </div>
  </div>
</aside>

<style>
  .side-menu {
    width: 250px;
    height: 100%;
    background: var(--c-bg-sidebar);
    border-right: 1px solid var(--c-border);
    display: flex;
    flex-direction: column;
    z-index: var(--z-modal);
    flex-shrink: 0;
    overflow: hidden;
    transition: width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  .side-menu.collapsed {
    width: 80px;
  }

  .scroll-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  .header {
    height: 80px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0 10px;
    position: relative;
  }

  .header-inner {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    position: relative;
  }

  .collapse-btn {
    background: transparent;
    border: none;
    color: var(--c-text-muted);
    width: 40px;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex-shrink: 0;
    transition:
      color 0.2s,
      background 0.2s;
    position: absolute;
    left: 8px;
    z-index: 10;
  }
  .collapsed .collapse-btn {
    left: 10px;
  }

  .collapse-btn:hover {
    color: var(--c-text-primary);
    background: var(--c-surface-hover);
  }

  .chevron {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  .chevron :global(svg) {
    width: 100%;
    height: 100%;
  }

  .logo-wrapper {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
    opacity: 1;
    transform: translateX(0);
  }
  .logo-wrapper.hidden {
    opacity: 0;
    transform: translateX(-10px);
    pointer-events: none;
  }

  .logo {
    height: 32px;
    color: var(--c-accent);
    filter: drop-shadow(0 0 8px var(--c-shadow-glow-accent));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo :global(svg) {
    height: 100%;
    width: auto;
    fill: currentColor !important;
  }

  .logo :global(svg path),
  .logo :global(svg rect),
  .logo :global(svg circle),
  .logo :global(svg polygon) {
    fill: currentColor !important;
    stroke: none;
  }

  .mobile-close {
    display: none;
    position: absolute;
    right: 15px;
    color: var(--c-text-primary);
    z-index: 5;
  }

  nav {
    padding: 10px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .nav-item {
    display: flex;
    align-items: center;
    width: auto;
    height: 48px;
    color: var(--c-text-muted);
    font-size: 15px;
    font-weight: 600;
    background: transparent;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;

    border-radius: 12px;
    margin: 2px 12px;

    padding: 0 16px;

    transition:
      background 0.2s,
      color 0.2s;
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
    margin-right: 16px;
    display: flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
    width: 24px;
    height: 24px;
  }
  .icon :global(svg) {
    width: 24px;
    height: 24px;
  }

  .label-text {
    opacity: 1;
    transition: opacity 0.2s ease;
  }
  .label-text.hidden {
    opacity: 0;
  }

  .sep {
    height: 1px;
    background: var(--c-border);
    margin: 10px 28px;
    flex-shrink: 0;
    opacity: 0.5;
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

  .footer {
    padding: 20px 0;
    text-align: center;
    margin-top: auto;
  }
  .footer-text {
    font-size: 10px;
    color: var(--c-text-muted);
    opacity: 0.5;
    transition: opacity 0.2s;
    white-space: nowrap;
  }
  .footer-text.hidden {
    opacity: 0;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--c-border);
    border-radius: 2px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  @media (max-width: 768px) and (orientation: portrait) {
    .side-menu {
      position: fixed;
      left: 0;
      top: 0;
      height: 100dvh;
      width: 280px !important;
      transform: translateX(-100%);
      transition: transform 0.3s ease;
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

    /* Force FULL View elements visible */
    .collapse-btn {
      display: none;
    }
    .logo-wrapper.hidden {
      opacity: 1 !important;
      transform: none !important;
    }
    .label-text.hidden {
      opacity: 1 !important;
    }
    .footer-text.hidden {
      opacity: 0.5 !important;
    }
  }

  @media (max-height: 600px) and (orientation: landscape) {
    .side-menu {
      width: 200px;
    }
    .side-menu.collapsed {
      width: 80px;
    }
    .nav-item {
      padding: 0 12px;
      padding-left: 16px;
    }
    .header {
      padding: 0 10px;
    }
    .collapse-btn {
      left: 8px;
    }
  }
</style>
