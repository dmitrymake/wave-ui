<script>
  import { fade, scale } from "svelte/transition";
  import {
    playlistSelector,
    closePlaylistSelector,
    playlists,
    showToast,
  } from "../lib/store";
  import { ICONS } from "../lib/icons";
  import { mpdClient } from "../lib/mpd/client";

  async function addTo(playlistName) {
    const track = $playlistSelector.track;
    if (!track) return;

    try {
      const safePl = playlistName.replace(/"/g, '\\"');
      const safeFile = track.file.replace(/"/g, '\\"');

      await mpdClient.send(`playlistadd "${safePl}" "${safeFile}"`);
      showToast(`Added to "${playlistName}"`, "success");
      closePlaylistSelector();
    } catch (e) {
      console.error(e);
      showToast("Failed to add to playlist", "error");
    }
  }
</script>

{#if $playlistSelector.isOpen}
  <div
    class="backdrop"
    on:click={closePlaylistSelector}
    transition:fade={{ duration: 150 }}
  >
    <div
      class="modal"
      transition:scale={{ start: 0.95, duration: 200 }}
      on:click|stopPropagation
    >
      <div class="header">
        <h3>Add to Playlist</h3>
        <button class="close-btn" on:click={closePlaylistSelector}>
          {@html ICONS.CLOSE}
        </button>
      </div>

      <div class="list">
        {#each $playlists as pl}
          {#if pl.name !== "Favorites"}
            <button class="pl-row" on:click={() => addTo(pl.name)}>
              <div class="pl-icon">{@html ICONS.PLAYLISTS}</div>
              <span>{pl.name}</span>
            </button>
          {/if}
        {/each}

        {#if $playlists.length <= 1}
          <div class="empty">No custom playlists created.</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
    padding: 20px;
  }

  .modal {
    background: var(--c-bg-app);
    width: 100%;
    max-width: 400px;
    max-height: 70vh;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--c-border);
  }

  .header {
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--c-border);
  }
  h3 {
    margin: 0;
    color: var(--c-text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--c-text-muted);
    cursor: pointer;
    width: 24px;
    height: 24px;
    padding: 0;
  }
  .close-btn :global(svg) {
    width: 100%;
    height: 100%;
  }

  .list {
    overflow-y: auto;
    padding: 10px 0;
  }

  .pl-row {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 12px 20px;
    background: none;
    border: none;
    color: var(--c-text-primary);
    text-align: left;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .pl-row:hover {
    background: var(--c-surface-hover);
  }

  .pl-icon {
    width: 24px;
    height: 24px;
    margin-right: 12px;
    color: var(--c-text-secondary);
  }
  .pl-icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .empty {
    padding: 20px;
    text-align: center;
    color: var(--c-text-muted);
  }
</style>
