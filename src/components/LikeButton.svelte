<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import type { Track } from "../lib/types";
  import { ICONS } from "../lib/icons";
  import { LibraryActions } from "../lib/mpd/library";
  import { YandexApi } from "../lib/yandex";
  import {
    favorites,
    yandexFavorites,
    showToast,
  } from "../lib/store.js";
  import { MSG } from "../lib/messages";
  import { isTrackLiked } from "../lib/playerHelpers";

  interface Props {
    track: Track;
    compact?: boolean;
  }

  let { track, compact = false }: Props = $props();

  let liked = $derived(isTrackLiked(track, $favorites, $yandexFavorites));

  async function handleClick(e: MouseEvent) {
    e.stopPropagation();
    if (!track || (!track.file && !track.id)) return;

    if (track.isYandex || track.service === "yandex") {
      const wasLiked = $yandexFavorites.has(String(track.id));
      try {
        yandexFavorites.update((s) => {
          const id = String(track.id);
          if (wasLiked) s.delete(id);
          else s.add(id);
          return s;
        });
        showToast(
          wasLiked ? MSG.FAV_REMOVED_YANDEX : MSG.FAV_ADDED_YANDEX,
          wasLiked ? "info" : "success",
        );
        await YandexApi.toggleLike(track.id, wasLiked);
      } catch (err) {
        showToast(MSG.FAV_ERROR_UPDATING, "error");
      }
    } else {
      LibraryActions.toggleFavorite(track);
    }
  }
</script>

<button
  class="btn-icon like-btn"
  class:liked
  class:compact
  onclick={handleClick}
>
  {@html liked ? ICONS.HEART_FILLED : ICONS.HEART}
</button>

<style>
  .like-btn {
    padding: 10px;
    color: var(--c-text-secondary);
    transition: color 0.2s;
  }
  .like-btn:active { opacity: 0.7; }
  .like-btn.liked { color: var(--c-heart); }
  .like-btn :global(svg) { width: 24px; height: 24px; }

  .compact { padding: 6px; }
  .compact :global(svg) { width: 20px; height: 20px; }
</style>
