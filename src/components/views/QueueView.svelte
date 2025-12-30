<script>
  import { queue } from "../../lib/store";
  import { PlayerActions } from "../../lib/mpd/player";
  import * as MPD from "../../lib/mpd";
  import { ICONS } from "../../lib/icons";

  import TrackRow from "../TrackRow.svelte";
  import BaseList from "./BaseList.svelte";

  let isEditMode = false;

  function toggleEditMode() {
    isEditMode = !isEditMode;
  }

  function playTrack(pos) {
    if (isEditMode) return;
    MPD.runMpdRequest(`play ${pos}`);
  }

  function handleRemove(index) {
    PlayerActions.removeFromQueue(index);
  }

  async function handleSaveQueue() {
    const name = prompt("Enter playlist name:");
    if (name) {
      await PlayerActions.saveQueue(name);
      MPD.loadPlaylists();
    }
  }

  function handleMoveTrack(fromIndex, toIndex) {
    PlayerActions.moveTrack(fromIndex, toIndex);
  }
</script>

<div class="view-container">
  <BaseList
    itemsStore={queue}
    {isEditMode}
    emptyText="Queue is empty"
    onMoveItem={handleMoveTrack}
  >
    <div slot="header" class="view-header-simple">
      <div class="header-info">
        <h1 class="header-title">Current Queue</h1>
        <span class="header-subtitle">
          {$queue.length} track{$queue.length === 1 ? "" : "s"}
        </span>
      </div>

      <div class="header-actions">
        <button
          class="btn-action"
          on:click={handleSaveQueue}
          title="Save Queue"
        >
          {@html ICONS.SAVE}
        </button>

        <button
          class="btn-action"
          class:active={isEditMode}
          on:click={toggleEditMode}
          title={isEditMode ? "Finish Editing" : "Edit Queue"}
        >
          {@html isEditMode ? ICONS.ACCEPT : ICONS.EDIT}
        </button>
      </div>
    </div>

    <div slot="row" let:item let:index let:startDrag>
      <TrackRow
        track={item}
        {index}
        isEditable={isEditMode}
        on:play={() => playTrack(index)}
        on:remove={() => handleRemove(index)}
        on:startdrag={startDrag}
      />
    </div>
  </BaseList>
</div>

<style>
  @import "./MusicViews.css";
</style>
