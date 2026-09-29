<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { MOTION, EASE_EMPHASIZED } from "../lib/transitions";
  import { ICONS } from "../lib/icons";
  import { Router } from "../lib/router";
  import {
    activeMenuTab,
    navigationStack,
    navigateBack,
    handleBrowserBack,
    isOwnHashAssignment,
    isFullPlayerOpen,
    toastMessage,
    connectionStatus,
  } from "../lib/store";

  import LibraryView from "./views/LibraryView.svelte";
  import IconButton from "./ui/IconButton.svelte";
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

  // In-app and browser Back pop the stack; the hash is then re-pointed at the
  // new top (replace, no new entry) so refresh/deep-link lands where the UI is.
  function goBack(): void {
    navigateBack();
    Router.syncTopToUrl();
  }

  onMount(() => {
    window.history.replaceState({ depth: $navigationStack.length }, "", "");
    const onPopState = () => {
      // Fragment navigations fire popstate too: skip ours (hashchange owns
      // them) and only treat genuine traversals as Back.
      if (isOwnHashAssignment()) return;
      // Single owner of Back: Router stack. Overlays (ContextMenu) close
      // themselves via their own popstate listener without flags.
      handleBrowserBack();
      Router.syncTopToUrl();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });
</script>

<div class="app-container">
  <div class="app-layout" class:player-open={$isFullPlayerOpen}>
    {#if isOffline}
      <div class="offline-banner" role="status" transition:fly={{ y: -40, duration: MOTION.base, easing: EASE_EMPHASIZED }}>
        <span class="offline-dot"></span>
        Connection lost — reconnecting…
      </div>
    {/if}

    {#if $toastMessage}
      <div class="toast-container" transition:fly={{ y: -50, duration: MOTION.base, easing: EASE_EMPHASIZED }}>
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
        <IconButton
          class="hamburger-btn"
          ariaLabel="Open menu"
          icon={ICONS.MENU}
          onclick={() => (isMobileMenuOpen = true)}
        />

        {#if $navigationStack.length > 1}
          <button class="back-btn" onclick={goBack}>
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
    /* Was #000 — a hardcoded pure-black dim, so in gruvbox the scrim was colder
       than the warm surface it dimmed. The themed black at the same opacity is
       identical in the default theme. */
    background: var(--c-black-90);
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
    box-shadow: var(--shadow-md);
    font-weight: var(--weight-semibold);
    font-size: var(--text-base);
    line-height: var(--leading-snug);
    /* A long message wraps inside the pill instead of running off a phone. */
    max-width: calc(100vw - var(--space-8));
    text-align: center;
    text-wrap: balance;
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
    /* 8px cap, not a 7px nudge: the banner is a pill on the same scale as the
       toast below it, and a 7px pad on 14px text is neither a step of the ladder
       nor the height the toast's own padding produces. */
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-md);
    font-weight: var(--weight-semibold);
    font-size: var(--text-base);
    pointer-events: none;
  }

  .offline-dot {
    width: var(--space-2);
    height: var(--space-2);
    border-radius: var(--radius-circle);
    background: var(--c-text-inverse);
    opacity: var(--opacity-strong);
    animation: offline-pulse var(--dur-pulse) var(--ease-default) infinite;
  }

  /* The same breath as the live badge's dot. */
  @keyframes offline-pulse {
    0%, 100% { opacity: var(--opacity-strong); }
    50% { opacity: var(--opacity-ghost); }
  }
  @media (prefers-reduced-motion: reduce) {
    .offline-dot { animation: none; }
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

  /* Shown only in the narrow layout (see the media query below). The rule is
     :global() because the class travels through a component prop, and
     .top-bar-prefixed so it outranks the primitive's own `display`. */
  .top-bar :global(.hamburger-btn) {
    display: none;
    color: var(--c-text-primary);
  }


  .back-btn {
    background: none;
    border: none;
    color: var(--c-accent-btn);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
    /* The hit area is the control's full height (the text was a 24px strip —
       on a phone this is the ONLY way back); the negative margins keep the
       label where it was. */
    min-height: var(--control-h-lg);
    /* Labeled control: pill, like the Button primitive. */
    border-radius: var(--radius-pill);
    line-height: var(--leading-none);
    transition: opacity var(--dur-instant) var(--ease-default);
  }
  .back-btn:active {
    opacity: var(--opacity-dim);
  }
  @media (pointer: coarse) {
    .back-btn {
      min-height: var(--target-touch);
    }
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

  /* The title role: 20px bold with display tracking, on one line. */
  .view-title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    line-height: var(--leading-snug);
    letter-spacing: var(--tracking-display);
    color: var(--c-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    .top-bar :global(.hamburger-btn) {
      display: inline-flex;
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
