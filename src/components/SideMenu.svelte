<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import logo from "../assets/wave-logo.svg?raw";
  import { ICONS } from "../lib/icons";
  import {
    activeMenuTab,
    isSyncingLibrary,
    isSidebarCollapsed,
    resetNavigation,
    assignHash,
  } from "../lib/store";
  import { isYandexEnabled } from "../lib/stores/yandex";
  import { ApiActions } from "../lib/api";
  import { FAVORITES_PLAYLIST } from "../lib/constants";
  import IconButton from "./ui/IconButton.svelte";

  let { isOpen = false, onClose }: { isOpen?: boolean; onClose?: () => void } = $props();

  let touchStartX = 0;
  let touchCurrentX = 0;
  let isSwiping = $state(false);

  const ALL_MENU_ITEMS = [
    { id: "queue", label: "Queue", icon: ICONS.MENU },
    { id: "favorites", label: FAVORITES_PLAYLIST, icon: ICONS.HEART },
    { id: "artists", label: "Artists", icon: ICONS.ARTISTS },
    { id: "albums", label: "Albums", icon: ICONS.ALBUMS },
    { id: "playlists", label: "Playlists", icon: ICONS.PLAYLISTS },
    { id: "radio", label: "Radio", icon: ICONS.RADIO },
    { id: "yandex", label: "Yandex Music", icon: ICONS.YANDEX },
  ];

  let visibleMenuItems = $derived(ALL_MENU_ITEMS.filter((item) => {
    if (item.id === "yandex") return $isYandexEnabled;
    return true;
  }));

  function switchTab(id: string) {
    const targetHash = `/${id}`;
    if (
      window.location.hash === `#${targetHash}` ||
      window.location.hash === targetHash
    ) {
      activeMenuTab.set(id);
      resetNavigation();
    } else {
      assignHash(targetHash);
    }
    onClose?.();
  }

  async function handleSync() {
    if ($isSyncingLibrary) return;
    await ApiActions.syncLibrary();
    assignHash("/artists");
  }

  function toggleCollapse() {
    isSidebarCollapsed.update((v: boolean) => !v);
  }

  function handleTouchStart(e: TouchEvent) {
    if (!isOpen) return;
    touchStartX = e.touches[0].clientX;
    touchCurrentX = touchStartX;
    isSwiping = true;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isSwiping) return;
    touchCurrentX = e.touches[0].clientX;
  }

  function handleTouchEnd() {
    if (!isSwiping) return;
    if (touchCurrentX - touchStartX < -70) onClose?.();
    isSwiping = false;
    touchStartX = 0;
    touchCurrentX = 0;
  }

  let translateX = $derived(isSwiping ? Math.min(0, touchCurrentX - touchStartX) : 0);
</script>

{#if isOpen}
  <div
    class="backdrop"
    onclick={() => onClose?.()}
    role="presentation"
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
    : "width var(--dur-slow) var(--ease-emphasized), transform var(--dur-base) var(--ease-default)"}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <div class="header">
    <div class="header-inner">
      <button
        class="collapse-btn"
        onclick={toggleCollapse}
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

    <IconButton
      class="mobile-close"
      ariaLabel="Close menu"
      icon={ICONS.CLOSE}
      onclick={() => onClose?.()}
    />
  </div>

  <div class="scroll-area">
    <nav>
      {#each visibleMenuItems as item (item.id)}
        <button
          class="nav-item"
          class:active={$activeMenuTab === item.id}
          aria-current={$activeMenuTab === item.id ? "page" : undefined}
          title={item.label}
          onclick={() => switchTab(item.id)}
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
        aria-current={$activeMenuTab === "search" ? "page" : undefined}
        title="Search"
        onclick={() => switchTab("search")}
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
        onclick={handleSync}
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
        aria-current={$activeMenuTab === "settings" ? "page" : undefined}
        title="Settings"
        onclick={() => switchTab("settings")}
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
    width: var(--sidebar-w);
    height: 100%;
    background: var(--c-bg-sidebar);
    border-right: var(--border-width-thin) solid var(--c-border);
    display: flex;
    flex-direction: column;
    z-index: var(--z-modal);
    flex-shrink: 0;
    overflow: hidden;
    transition: width var(--dur-slow) var(--ease-emphasized);
  }

  .side-menu.collapsed {
    width: var(--sidebar-w-collapsed);
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
    padding: var(--space-0) var(--space-3);
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
    width: var(--control-h-lg);
    height: var(--control-h-lg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    flex-shrink: 0;
    transition:
      color var(--dur-fast),
      background var(--dur-fast);
    position: absolute;
    left: var(--space-2);
    z-index: var(--z-overlay-local);
  }
  .collapsed .collapse-btn {
    left: var(--space-3);
  }

  .collapse-btn:hover {
    color: var(--c-text-primary);
    background: var(--c-surface-hover);
  }

  .chevron {
    width: var(--icon-size-lg);
    height: var(--icon-size-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--dur-slow) var(--ease-emphasized);
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
      opacity var(--trans-fast),
      transform var(--trans-fast);
    opacity: var(--opacity-visible);
    transform: translateX(0);
  }
  .logo-wrapper.hidden {
    opacity: var(--opacity-hidden);
    transform: translateX(calc(-1 * var(--space-3)));
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
    fill: currentColor;
  }

  .logo :global(svg path),
  .logo :global(svg rect),
  .logo :global(svg circle),
  .logo :global(svg polygon) {
    fill: currentColor;
    stroke: none;
  }

  .header :global(.mobile-close) {
    display: none;
    position: absolute;
    right: var(--space-4);
    color: var(--c-text-primary);
    z-index: var(--z-content);
  }

  nav {
    padding: var(--space-3) var(--space-0);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
  }

  .nav-item {
    display: flex;
    align-items: center;
    width: auto;
    height: var(--control-h-xl);
    color: var(--c-text-muted);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    background: transparent;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;

    border-radius: var(--radius-lg);
    margin: var(--space-0_5) var(--space-3);

    padding: var(--space-0) var(--space-4);

    /* Text the finger slides over on every scroll — a selection highlight here
       paints a white block over the menu. */
    user-select: none;
    -webkit-user-select: none;

    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-instant);
  }
  /* Press feedback: on a touchscreen there is no :hover, so without this a tap
     on a menu item gave no feedback at all. */
  .nav-item:active {
    transform: scale(0.97);
  }
  .nav-item:hover {
    background: var(--c-surface-hover);
    color: var(--c-text-primary);
  }
  /* AA: dark label on the accent-btn fill (5.53:1 default / 5.84:1 gruvbox).
     White on --c-accent was 3.79 / 3.41 — below AA in both themes. */
  .nav-item.active {
    background: var(--c-accent-btn);
    color: var(--c-text-inverse);
  }

  .icon {
    margin-right: var(--space-4);
    display: flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
    width: var(--icon-size-lg);
    height: var(--icon-size-lg);
  }
  .icon :global(svg) {
    width: var(--icon-size-lg);
    height: var(--icon-size-lg);
  }

  .label-text {
    opacity: var(--opacity-visible);
    transition: opacity var(--trans-fast);
  }
  .label-text.hidden {
    opacity: var(--opacity-hidden);
  }

  .sep {
    height: var(--border-width-thin);
    background: var(--c-border);
    margin: var(--space-3) var(--space-7);
    flex-shrink: 0;
    opacity: var(--opacity-faint);
  }
  .spin {
    animation: rotate 2s var(--ease-linear) infinite;
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
    padding: var(--space-5) var(--space-0);
    text-align: center;
    margin-top: auto;
  }
  .footer-text {
    font-size: var(--text-xs);
    color: var(--c-text-muted);
    transition: opacity var(--dur-fast);
    white-space: nowrap;
  }
  .footer-text.hidden {
    opacity: var(--opacity-hidden);
  }

  /* Scrollbars are styled once, globally, in src/styles/shared.css. */

  @media (max-width: 768px) and (orientation: portrait) {
    .side-menu {
      position: fixed;
      left: var(--space-0);
      top: var(--space-0);
      height: 100dvh;
      width: var(--dock-w) !important;
      transform: translateX(-100%);
      transition: transform var(--dur-base) var(--ease-default);
    }
    .side-menu.mobile-open {
      transform: translateX(0);
    }
    .header :global(.mobile-close) {
      display: inline-flex;
    }
    .backdrop {
      position: fixed;
      inset: var(--space-0);
      background: var(--c-overlay-backdrop);
      z-index: var(--z-sidebar);
      backdrop-filter: blur(4px);
    }

    .collapse-btn {
      display: none;
    }
    .logo-wrapper.hidden {
      opacity: var(--opacity-visible) !important;
      transform: none !important;
    }
    .label-text.hidden {
      opacity: var(--opacity-visible) !important;
    }
    .footer-text.hidden {
      opacity: var(--opacity-faint) !important;
    }

    /* The drawer is a screen of its own on a phone, so its insets are the
       screen's insets: 16px like .content-padded and the track rows behind it,
       not the 12px the 250px Pi sidebar uses. Nothing in the Pi's block changes. */
    .header {
      padding: var(--space-0) var(--space-4);
    }
    .nav-item {
      margin: var(--space-0_5) var(--space-4);
    }
    .sep {
      margin: var(--space-3) var(--space-8);
    }
  }

  @media (max-height: 600px) and (orientation: landscape) {
    .side-menu {
      width: 200px;
    }
    .side-menu.collapsed {
      width: var(--sidebar-w-collapsed);
    }
    .nav-item {
      padding: var(--space-0) var(--space-3);
      padding-left: var(--space-4);
    }
    .header {
      padding: var(--space-0) var(--space-3);
    }
    .collapse-btn {
      left: var(--space-2);
    }
  }
</style>
