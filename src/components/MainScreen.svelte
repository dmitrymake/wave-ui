<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { ICONS } from "../lib/icons";
  import { get } from "svelte/store";
  import {
    activeMenuTab,
    navigationStack,
    navigateBack,
    handleBrowserBack,
    isFullPlayerOpen,
    toastMessage,
    connectionStatus,
    ignoreNextPopState,
  } from "../lib/store";

  import LibraryView from "./views/LibraryView.svelte";
  import RadioView from "./views/RadioView.svelte";
  import PlaylistsView from "./views/PlaylistsView.svelte";
  import SearchView from "./views/SearchView.svelte";
  import SettingsView from "./views/SettingsView.svelte";
  import QueueView from "./views/QueueView.svelte";
  import YandexView from "./views/YandexView.svelte";

  import MiniPlayer from "./MiniPlayer.svelte";
  import FullPlayer from "./FullPlayer.svelte";
  import SideMenu from "./SideMenu.svelte";

  let isMobileMenuOpen = $state(false);

  // Surface a WebSocket outage to the user: while the MPD socket is down the
  // optimistic transport controls silently no-op, so a quiet banner tells them
  // playback control is unavailable and that we are reconnecting.
  let isOffline = $derived($connectionStatus !== "Connected");

  onMount(() => {
    window.history.replaceState({ depth: $navigationStack.length }, "", "");
    const onPopState = () => {
      if (get(ignoreNextPopState)) {
        ignoreNextPopState.set(false);
        return;
      }
      handleBrowserBack();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });
</script>

<div class="app-container">
  <div class="app-layout" class:player-open={$isFullPlayerOpen}>
    {#if isOffline}
      <div class="offline-banner" role="status" transition:fly={{ y: -40, duration: 300 }}>
        <span class="offline-dot"></span>
        Connection lost — reconnecting…
      </div>
    {/if}

    {#if $toastMessage}
      <div class="toast-container" transition:fly={{ y: -50, duration: 300 }}>
        <div class="toast-body {$toastMessage.type}">
          {$toastMessage.text}
        </div>
      </div>
    {/if}

    <SideMenu
      isOpen={isMobileMenuOpen}
      onClose={() => (isMobileMenuOpen = false)}
    />

    <main class="content-area">
      <header class="top-bar">
        <button
          class="hamburger-btn"
          onclick={() => (isMobileMenuOpen = true)}
        >
          {@html ICONS.MENU}
        </button>

        {#if $navigationStack.length > 1}
          <button class="back-btn" onclick={navigateBack}>
            <span class="icon-inline">{@html ICONS.BACK}</span> Back
          </button>
        {:else}
          <div class="view-title">
            {#if $activeMenuTab === "radio"}Radio
            {:else if $activeMenuTab === "playlists"}Playlists
            {:else if $activeMenuTab === "search"}Search
            {:else if $activeMenuTab === "yandex"}Yandex Music
            {:else if $activeMenuTab === "queue"}Queue
            {:else if $activeMenuTab === "favorites"}Favorites
            {:else if $activeMenuTab === "settings"}Settings
            {:else}{($activeMenuTab || "Library").charAt(0).toUpperCase() +
                ($activeMenuTab || "library").slice(1)}
            {/if}
          </div>
        {/if}
      </header>

      <div
        class="scroll-container"
        style="padding-bottom: {$isFullPlayerOpen
          ? '0px'
          : 'var(--mini-player-height)'};"
      >
        <div class="view-wrapper">
          {#if $activeMenuTab === "radio"}
            <RadioView />
          {:else if $activeMenuTab === "yandex"}
            <YandexView />
          {:else if $activeMenuTab === "queue"}
            <QueueView />
          {:else if $activeMenuTab === "playlists" || $activeMenuTab === "favorites"}
            <PlaylistsView />
          {:else if $activeMenuTab === "search"}
            <SearchView />
          {:else if $activeMenuTab === "settings"}
            <SettingsView />
          {:else}
            <LibraryView activeCategory={$activeMenuTab} />
          {/if}
        </div>
      </div>
    </main>

    <div class="docked-player-container">
      <FullPlayer isDocked={true} />
    </div>
  </div>

  <div class="mini-player-wrapper">
    <MiniPlayer />
  </div>
</div>

{#if $isFullPlayerOpen}
  <div class="full-player-modal">
    <FullPlayer />
  </div>
{/if}

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100dvh;
    background: var(--c-bg-app);
    overflow: hidden;
  }

  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    position: relative;
    z-index: 1;
    /* Depth: recede behind the now-playing sheet (Apple Music container transform).
       Transform auto-promotes to a layer during the animation — no standing will-change. */
    transform-origin: center center;
    transition: transform var(--dur-base) var(--ease-emphasized);
  }
  /* Dim via a composited opacity overlay instead of an animated filter:brightness
     (which re-rasterized the entire app subtree every frame on open AND close).
     #000 @ 0.5 over the dark app reads identically to brightness(0.5). */
  .app-layout::after {
    content: "";
    position: absolute;
    inset: var(--space-0);
    background: #000;
    opacity: var(--opacity-hidden);
    pointer-events: none;
    z-index: calc(var(--z-modal) + 1);
    transition: opacity var(--dur-base) var(--ease-emphasized);
  }
  .app-layout.player-open {
    transform: scale(0.92);
  }
  .app-layout.player-open::after {
    opacity: var(--opacity-faint);
  }
  @media (prefers-reduced-motion: reduce) {
    .app-layout,
    .app-layout::after {
      transition: none;
    }
    .app-layout.player-open {
      transform: none;
    }
    .app-layout.player-open::after {
      opacity: var(--opacity-hidden);
    }
  }

  .toast-container {
    position: fixed;
    top: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
  }

  .toast-body {
    background: var(--c-bg-toast);
    color: var(--c-text-primary);
    padding: var(--space-3) var(--space-6);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-md-popover);
    font-weight: var(--weight-semibold);
    font-size: var(--text-base);
  }

  /* Unobtrusive offline indicator: a slim pill anchored under the header, themed via
     CSS variables so both palettes render it correctly. Sits just below toasts. */
  .offline-banner {
    position: fixed;
    top: var(--space-3);
    left: 50%;
    transform: translateX(-50%);
    z-index: calc(var(--z-toast) - 1);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--c-error);
    color: var(--c-text-inverse);
    padding: var(--space-7px) var(--space-4);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-md-popover);
    font-weight: var(--weight-semibold);
    font-size: var(--text-base);
    pointer-events: none;
  }

  .offline-dot {
    width: var(--space-2);
    height: var(--space-2);
    border-radius: var(--radius-circle);
    background: var(--c-text-inverse);
    opacity: 0.85;
    animation: offline-pulse 1.4s ease-in-out infinite;
  }

  @keyframes offline-pulse {
    0%, 100% { opacity: 0.85; }
    50% { opacity: 0.2; }
  }

  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--c-bg-main);
    min-width: 0;
    height: 100%;
    transition: flex var(--dur-base) var(--ease-default);
  }

  .top-bar {
    height: var(--header-height);
    display: flex;
    align-items: center;
    padding: var(--space-0) var(--space-4);
    background: var(--c-bg-glass);
    border-bottom: var(--border-default-dim);
    gap: var(--space-4);
    flex-shrink: 0;
  }

  .scroll-container {
    flex: 1;
    overflow-x: hidden;
    position: relative;
    transition: padding-bottom var(--dur-base) var(--ease-default);
  }

  .view-wrapper {
    height: 100%;
    width: 100%;
  }

  .hamburger-btn {
    display: none;
    background: none;
    border: none;
    color: var(--c-text-primary);
    cursor: pointer;
  }
  .hamburger-btn :global(svg) {
    width: var(--icon-size-lg);
    height: var(--icon-size-lg);
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--c-accent);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-0);
    line-height: var(--leading-none);
  }

  .icon-inline {
    display: flex;
    align-items: center;
  }

  .back-btn :global(svg) {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
    display: block;
  }

  .view-title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--c-text-primary);
  }

  .docked-player-container {
    display: none;
    width: var(--dock-w);
    flex-shrink: 0;
    background: var(--c-bg-main);
    border-left: var(--border-default);
    z-index: 5;
  }

  .full-player-modal {
    position: fixed;
    inset: var(--space-0);
    z-index: var(--z-modal);
  }

  @media (max-width: 768px) {
    .hamburger-btn {
      display: block;
    }
    .top-bar {
      padding: var(--space-0) var(--space-4);
    }
  }

  @media (max-height: 600px) and (orientation: landscape) {
    .top-bar {
      display: none;
    }

    .mini-player-wrapper {
      display: none;
    }

    .scroll-container {
      padding-bottom: var(--space-0) !important;
    }

    .docked-player-container {
      display: block;
    }
  }
</style>
