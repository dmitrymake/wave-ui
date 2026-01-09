<script>
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { ICONS } from "../lib/icons";
  import {
    activeMenuTab,
    navigationStack,
    navigateBack,
    handleBrowserBack,
    isFullPlayerOpen,
    toastMessage,
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

  let isMobileMenuOpen = false;

  onMount(() => {
    window.history.replaceState({ depth: $navigationStack.length }, "", "");
    const onPopState = () => handleBrowserBack();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });
</script>

<div class="app-container">
  <div class="app-layout">
    {#if $toastMessage}
      <div class="toast-container" transition:fly={{ y: -50, duration: 300 }}>
        <div class="toast-body {$toastMessage.type}">
          {$toastMessage.text}
        </div>
      </div>
    {/if}

    <SideMenu
      isOpen={isMobileMenuOpen}
      on:close={() => (isMobileMenuOpen = false)}
    />

    <main class="content-area">
      <header class="top-bar">
        <button
          class="hamburger-btn"
          on:click={() => (isMobileMenuOpen = true)}
        >
          {@html ICONS.MENU}
        </button>

        {#if $navigationStack.length > 1}
          <button class="back-btn" on:click={navigateBack}>
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

    --mini-player-height: 90px;
  }

  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    position: relative;
    z-index: 1;
  }

  .toast-container {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
  }

  .toast-body {
    background: var(--c-bg-toast);
    color: var(--c-text-primary);
    padding: 12px 24px;
    border-radius: 30px;
    box-shadow: 0 4px 15px var(--c-shadow-popover);
    font-weight: 600;
    font-size: 14px;
  }

  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--c-bg-main);
    min-width: 0;
    height: 100%;
    transition: flex 0.3s ease;
  }

  .top-bar {
    height: var(--header-height);
    display: flex;
    align-items: center;
    padding: 0 32px;
    background: var(--c-bg-glass);
    border-bottom: 1px solid var(--c-border-dim);
    gap: 15px;
    flex-shrink: 0;
  }

  .scroll-container {
    flex: 1;
    overflow-x: hidden;
    position: relative;
    transition: padding-bottom 0.3s ease;
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
    width: 24px;
    height: 24px;
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--c-accent);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    line-height: 1;
  }

  .icon-inline {
    display: flex;
    align-items: center;
  }

  .back-btn :global(svg) {
    width: 20px;
    height: 20px;
    display: block;
  }

  .view-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--c-text-primary);
  }

  .docked-player-container {
    display: none;
    width: 280px;
    flex-shrink: 0;
    background: var(--c-surface);
    border-left: 1px solid var(--c-border);
    z-index: 5;
  }

  .full-player-modal {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
  }

  @media (max-width: 768px) {
    .hamburger-btn {
      display: block;
    }
    .top-bar {
      padding: 0 16px;
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
      padding-bottom: 0 !important;
    }

    .docked-player-container {
      display: block;
    }
  }
</style>
