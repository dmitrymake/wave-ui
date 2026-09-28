// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { longpress } from "../actions.js";

describe("longpress action", () => {
  let node: HTMLDivElement;
  let action: ReturnType<typeof longpress> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    node = document.createElement("div");
    document.body.appendChild(node);
  });

  afterEach(() => {
    if (action && action.destroy) action.destroy();
    document.body.removeChild(node);
    vi.useRealTimers();
  });

  it("dispatches longpress event after duration", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire if released early", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    vi.advanceTimersByTime(200);
    node.dispatchEvent(new MouseEvent("mouseup"));

    vi.advanceTimersByTime(500);
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores right-click", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new MouseEvent("mousedown", { button: 2 }));
    vi.advanceTimersByTime(600);
    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels on mouseleave", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    vi.advanceTimersByTime(200);
    node.dispatchEvent(new MouseEvent("mouseleave"));

    vi.advanceTimersByTime(500);
    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels on touchmove", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new TouchEvent("touchstart", { touches: [{} as Touch] }));
    vi.advanceTimersByTime(200);
    node.dispatchEvent(new TouchEvent("touchmove"));

    vi.advanceTimersByTime(500);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not start when gesture begins on a slider descendant", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    node.appendChild(slider);

    action = longpress(node, { duration: 500 });

    slider.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    vi.advanceTimersByTime(600);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not start when gesture begins on a button descendant", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);
    const btn = document.createElement("button");
    node.appendChild(btn);

    action = longpress(node, { duration: 500 });

    btn.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    vi.advanceTimersByTime(600);
    expect(handler).not.toHaveBeenCalled();
  });

  it("still fires for a non-interactive descendant", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);
    const child = document.createElement("div");
    node.appendChild(child);

    action = longpress(node, { duration: 500 });

    child.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("still fires when the node itself has role=button", () => {
    node.setAttribute("role", "button");
    const handler = vi.fn();
    node.addEventListener("longpress", handler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("uses a 600ms default duration", () => {
    const handler = vi.fn();
    node.addEventListener("longpress", handler);

    action = longpress(node);

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    vi.advanceTimersByTime(599);
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("swallows the click the browser synthesizes after a long press", () => {
    // Regression: on a touchscreen, lifting the finger after a long press also
    // fired a click, which played the track (or closed the menu that had just
    // opened) on top of the long-press action.
    const longpressHandler = vi.fn();
    const clickHandler = vi.fn();
    node.addEventListener("longpress", longpressHandler);
    node.addEventListener("click", clickHandler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    vi.advanceTimersByTime(500);
    expect(longpressHandler).toHaveBeenCalledTimes(1);

    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clickHandler).not.toHaveBeenCalled();
  });

  it("does not swallow an ordinary click", () => {
    const clickHandler = vi.fn();
    node.addEventListener("click", clickHandler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    node.dispatchEvent(new MouseEvent("mouseup"));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it("lets the next click through after a long press was swallowed", () => {
    const clickHandler = vi.fn();
    node.addEventListener("click", clickHandler);

    action = longpress(node, { duration: 500 });

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    vi.advanceTimersByTime(500);
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it("cleans up listeners on destroy", () => {
    action = longpress(node, { duration: 500 });
    action.destroy();

    const handler = vi.fn();
    node.addEventListener("longpress", handler);

    node.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    vi.advanceTimersByTime(600);
    expect(handler).not.toHaveBeenCalled();
  });

  it("never arms, so the click that follows a long press is not swallowed", () => {
    // The shared media card wires a context menu to only some of its callers.
    // An unarmed long press still swallowed the click (handleClick only looks at
    // `fired`), which would have made a 600ms press on every other card do
    // nothing at all.
    const node = document.createElement("div");
    const handler = vi.fn();
    node.addEventListener("longpress", handler);
    const action = longpress(node, { enabled: false });

    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    vi.advanceTimersByTime(2000);
    expect(handler).not.toHaveBeenCalled();

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    const cardClick = vi.fn();
    node.addEventListener("click", cardClick);
    node.dispatchEvent(click);
    expect(cardClick).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(false);

    action.destroy();
  });
});
