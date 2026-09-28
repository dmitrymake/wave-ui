// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import MediaCard from "../../components/MediaCard.svelte";

// A snippet with no template of its own: MediaCard only needs the cover slot to
// exist, and the tests care about the card's own behaviour.
const cover = createRawSnippet(() => ({ render: () => `<span data-cover></span>` }));
const sub = createRawSnippet(() => ({ render: () => `<span data-sub></span>` }));
const coverExtra = createRawSnippet(() => ({ render: () => `<button data-chip>dots</button>` }));

describe("MediaCard", () => {
  it("activates on click, Enter and Space", async () => {
    const onactivate = vi.fn();
    const { getByRole } = render(MediaCard, { props: { cover, title: "Mix", onactivate } });
    const card = getByRole("button");

    card.click();
    expect(onactivate).toHaveBeenCalledTimes(1);

    // Keyboard: Enter and Space, with the page scroll suppressed for Space.
    const space = new KeyboardEvent("keydown", { key: " ", cancelable: true, bubbles: true });
    card.dispatchEvent(space);
    expect(onactivate).toHaveBeenCalledTimes(2);
    expect(space.defaultPrevented).toBe(true);

    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onactivate).toHaveBeenCalledTimes(3);

    // Any other key is not an activation.
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(onactivate).toHaveBeenCalledTimes(3);
  });

  it("does not activate the card when a control on the cover was pressed", () => {
    // The playlist card's "more actions" chip lives on the cover: activating the
    // card as well opened the menu and the playlist behind it.
    const onactivate = vi.fn();
    const { container } = render(MediaCard, { props: { cover, coverExtra, onactivate } });
    const chip = container.querySelector<HTMLButtonElement>("[data-chip]")!;
    chip.click();
    expect(onactivate).not.toHaveBeenCalled();
  });

  it("gives the title to assistive tech and keeps the optional parts optional", () => {
    const { container, rerender } = render(MediaCard, { props: { cover, title: "Chill Vibes" } });
    expect(container.querySelector(".card-title")).toHaveTextContent("Chill Vibes");
    expect(container.querySelector("[data-cover]")).not.toBeNull();
    // No sub snippet, no cover-extra layer: nothing empty left behind.
    expect(container.querySelector(".card-sub-row")).toBeNull();
    expect(container.querySelector(".cover-extra")).toBeNull();

    rerender({ cover, title: "Chill Vibes", sub, coverExtra, playable: false });
    expect(container.querySelector("[data-sub]")).not.toBeNull();
    expect(container.querySelector(".cover-extra [data-chip]")).not.toBeNull();
    expect(container.querySelector(".play-overlay")).toBeNull();
  });

  it("routes the context menu event to the caller's handler", () => {
    const oncontextmenu = vi.fn();
    const { container } = render(MediaCard, { props: { cover, oncontextmenu } });
    container
      .querySelector(".music-card")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(oncontextmenu).toHaveBeenCalledTimes(1);
  });
});
