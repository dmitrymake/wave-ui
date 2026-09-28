// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import IconButton from "../../components/ui/IconButton.svelte";

const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0" /></svg>';

describe("IconButton", () => {
  it("renders the glyph passed as a prop and names the control for a screen reader", () => {
    const { getByLabelText, container } = render(IconButton, {
      props: { ariaLabel: "More actions", icon: ICON },
    });
    const button = getByLabelText("More actions");
    expect(button.tagName).toBe("BUTTON");
    // type is forced: these are icon controls inside rows and forms, and a
    // stray default submit would post a form the app never wanted to post.
    expect(button).toHaveAttribute("type", "button");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("names the size after the tap target, not the glyph", () => {
    // The whole point of the migration: a bare glyph and a row action used to come
    // out of the same markup at different sizes.
    const { getByLabelText, rerender } = render(IconButton, {
      props: { ariaLabel: "a", icon: ICON, size: "lg" },
    });
    expect(getByLabelText("a").className).toContain("ibtn--lg");
    rerender({ ariaLabel: "a", icon: ICON, size: "sm" });
    expect(getByLabelText("a").className).toContain("ibtn--sm");
  });

  it("marks the pressed state for assistive tech and for the accent tone", () => {
    const { getByLabelText, rerender } = render(IconButton, {
      props: { ariaLabel: "Shuffle", icon: ICON, tone: "accent" },
    });
    expect(getByLabelText("Shuffle")).toHaveAttribute("aria-pressed", "false");
    rerender({ ariaLabel: "Shuffle", icon: ICON, tone: "accent", active: true });
    const button = getByLabelText("Shuffle");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.className).toContain("is-active");
  });

  it("is inert while disabled", () => {
    const onClick = vi.fn();
    const { getByLabelText } = render(IconButton, {
      props: { ariaLabel: "Like", icon: ICON, disabled: true, onclick: onClick },
    });
    getByLabelText("Like").click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
