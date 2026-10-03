// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import YoutubeView from "../views/YoutubeView.svelte";
import { YoutubeApi, YoutubeApiError } from "../../lib/youtube";
import { YoutubeService } from "../../lib/youtubeService";
import { youtubeStatus, youtubeMeta } from "../../lib/stores/youtube";
import { navigationStack, setNavigationStack, setNavigationCallback, resetNavigation } from "../../lib/store";
import type { YoutubeDetails, YoutubeTrack } from "../../lib/types/youtube";

function track(id: string, title: string): YoutubeTrack {
  return { id, title, file: `http://127.0.0.1:8766/youtube/stream/${id}`, artist: "Artist", album: "", time: 123, genre: "", track: "", service: "youtube" };
}
const first = track("abcdefghijk", "First song");
const second = track("lmnopqrstuv", "Second song");
function page(tracks: YoutubeTrack[], overrides: Partial<YoutubeDetails> = {}): YoutubeDetails {
  return { title: "Playlist", tracks, cards: [], hiddenCount: 0, ...overrides };
}

beforeEach(() => {
  vi.restoreAllMocks();
  youtubeStatus.set({ authorized: true, playbackReady: true });
  youtubeMeta.set({});
  resetNavigation();
  setNavigationCallback(() => {});
  vi.spyOn(YoutubeApi, "home").mockResolvedValue([]);
  vi.spyOn(YoutubeApi, "playlists").mockResolvedValue([]);
});

describe("YouTube Music view", () => {
  it("offers connection settings when no browser session is connected", () => {
    youtubeStatus.set({ authorized: false, playbackReady: false });
    const screen = render(YoutubeView);
    expect(screen.getByText("YouTube Music Not Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeInTheDocument();
    expect(YoutubeApi.home).not.toHaveBeenCalled();
  });
  it("loads a playlist immediately when authorization finishes after mount", async () => {
    youtubeStatus.set({ authorized: false, playbackReady: true });
    setNavigationStack([{ view: "root" }, { view: "youtube_playlist", data: { id: "PL_test" } }]);
    vi.spyOn(YoutubeApi, "playlist").mockResolvedValue(page([first]));
    const screen = render(YoutubeView);
    youtubeStatus.set({ authorized: true, playbackReady: true });
    await waitFor(() => expect(screen.getByText("First song")).toBeInTheDocument());
    expect(YoutubeApi.playlist).toHaveBeenCalledWith("PL_test");
  });
  it("changes search categories for the same query", async () => {
    setNavigationStack([{ view: "root" }, { view: "youtube_search", data: { query: "Artist", filter: "songs" } }]);
    vi.spyOn(YoutubeApi, "search").mockResolvedValue({ tracks: [first], cards: [], hiddenCount: 0 });
    const screen = render(YoutubeView);
    await waitFor(() => expect(screen.getByText("First song")).toBeInTheDocument());
    await fireEvent.change(screen.getByRole("combobox"), { target: { value: "albums" } });
    await waitFor(() => expect(YoutubeApi.search).toHaveBeenCalledWith("Artist", "albums"));
    expect(get(navigationStack).at(-1)?.data?.filter).toBe("albums");
  });
  it("ignores a slow response once the user types a new query", async () => {
    let resolveFirst!: (value: { tracks: YoutubeTrack[]; cards: []; hiddenCount: number }) => void;
    const oldResponse = new Promise<{ tracks: YoutubeTrack[]; cards: []; hiddenCount: number }>((resolve) => { resolveFirst = resolve; });
    setNavigationStack([{ view: "root" }, { view: "youtube_search", data: { query: "Old", filter: "songs" } }]);
    vi.spyOn(YoutubeApi, "search").mockImplementation((query) => query === "Old" ? oldResponse : Promise.resolve({ tracks: [second], cards: [], hiddenCount: 0 }));
    const screen = render(YoutubeView);
    await waitFor(() => expect(YoutubeApi.search).toHaveBeenCalledWith("Old", "songs"));
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "New" } });
    resolveFirst({ tracks: [first], cards: [], hiddenCount: 0 });
    await waitFor(() => expect(screen.getByText("Second song")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.queryByText("First song")).not.toBeInTheDocument();
  });
  it("fetches every remaining page before Play all changes playback", async () => {
    setNavigationStack([{ view: "root" }, { view: "youtube_playlist", data: { id: "PL_test" } }]);
    vi.spyOn(YoutubeApi, "playlist").mockImplementation((_id, offset) => Promise.resolve(offset === 50
      ? page([second], { nextOffset: 100, hasMore: false })
      : page([first], { nextOffset: 50, hasMore: true })));
    const play = vi.spyOn(YoutubeService, "playTracks").mockResolvedValue();
    const screen = render(YoutubeView);
    await waitFor(() => expect(screen.getByText("First song")).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "Play All" }));
    await waitFor(() => expect(play).toHaveBeenCalledWith([first, second]));
    expect(YoutubeApi.playlist).toHaveBeenCalledWith("PL_test", 50);
  });
  it("shows the reconnect screen after an expired session", async () => {
    setNavigationStack([{ view: "root" }, { view: "youtube_playlist", data: { id: "PL_test" } }]);
    vi.spyOn(YoutubeApi, "playlist").mockRejectedValue(new YoutubeApiError(401, "Session expired"));
    const screen = render(YoutubeView);
    await waitFor(() => expect(screen.getByText("YouTube Music Not Connected")).toBeInTheDocument());
    expect(get(youtubeStatus).authorized).toBe(false);
  });
  it("uses one Favorites card without separate dashboard action buttons", async () => {
    vi.spyOn(YoutubeApi, "home").mockResolvedValue([{ title: "Your favorites", tracks: [], hiddenCount: 0,
      cards: [{ id: "LM", title: "Liked Music", kind: "playlist" }] }]);
    vi.spyOn(YoutubeApi, "playlists").mockResolvedValue([{ id: "LM", title: "Liked Music", kind: "playlist" },
      { id: "PL_test", title: "My playlist", kind: "playlist" }]);
    const screen = render(YoutubeView);
    await waitFor(() => expect(screen.getByText("My playlist")).toBeInTheDocument());
    expect(screen.getAllByText("Favorites")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Liked songs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });
  it("keeps playlist rows compact and uses the shared header structure", async () => {
    setNavigationStack([{ view: "root" }, { view: "youtube_playlist", data: { id: "PL_test" } }]);
    vi.spyOn(YoutubeApi, "playlist").mockResolvedValue(page([first, second], { trackCount: 2 }));
    const screen = render(YoutubeView);
    await waitFor(() => expect(screen.getByText("First song")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Play All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To Queue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track radio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lyrics" })).not.toBeInTheDocument();
    expect(screen.container.querySelector('.content-padded .view-header .header-text-group')).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
