// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { writable } from "svelte/store";
import { THEMES } from "../theme";
import type { ToastMessage, ModalState, ContextMenuState, ContextMenuContext, Track } from "../types";


let savedTheme = "default";
try { savedTheme = localStorage.getItem("app_theme") || "default"; } catch {}
export const currentTheme = writable<string>(savedTheme);

currentTheme.subscribe((id: string) => {
  if (typeof document === "undefined") return;
  try { localStorage.setItem("app_theme", id); } catch {}
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return;
  const root = document.documentElement;
  document.body.setAttribute("data-theme", id);
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
});


export const toastMessage = writable<ToastMessage | null>(null);
let toastTimer: ReturnType<typeof setTimeout>;

export function showToast(msg: string, type: "info" | "success" | "error" = "info"): void {
  toastMessage.set({ text: msg, type });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.set(null);
  }, 3000);
}


export const modal = writable<ModalState>({
  isOpen: false,
  title: "",
  message: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  onConfirm: null,
  type: "confirm",
  inputValue: "",
  placeholder: "",
  options: [],
});

export function showModal({
  title = "Confirm Action",
  message = "Are you sure?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  type = "confirm" as ModalState["type"],
  inputValue = "",
  placeholder = "",
  options = [] as { label: string; value: string }[],
  onConfirm = (() => {}) as (value?: string) => void,
}): void {
  modal.set({
    isOpen: true,
    title,
    message,
    confirmLabel,
    cancelLabel,
    type,
    inputValue,
    placeholder,
    options,
    onConfirm,
  });
}

export function closeModal(): void {
  modal.set({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "",
    cancelLabel: "",
    onConfirm: null,
    type: "confirm",
    inputValue: "",
    placeholder: "",
    options: [],
  });
}


export const isFullPlayerOpen = writable<boolean>(false);
export const activeMenuTab = writable<string>("library");
export const connectionStatus = writable<string>("Disconnected");

let storedSidebar = false;
try { storedSidebar = localStorage.getItem("sidebarCollapsed") === "true"; } catch {}
export const isSidebarCollapsed = writable<boolean>(storedSidebar);

isSidebarCollapsed.subscribe((val: boolean) => {
  try { localStorage.setItem("sidebarCollapsed", String(val)); } catch {}
});


export const contextMenu = writable<ContextMenuState>({
  isOpen: false,
  track: null,
  context: { type: "general", playlistName: null, index: null },
  x: 0,
  y: 0,
  triggerRect: null,
});

function vibrate(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(70);
    } catch (e) {}
  }
}

// Handlers receive either a raw pointer/touch event or the `longpress` CustomEvent
// (whose detail carries the originating event). MouseEvent.detail is a number, so a
// plain `extends Event` with an object detail does not fit — model the real union.
export type EventWithDetail =
  | MouseEvent
  | TouchEvent
  | CustomEvent<{ originalEvent?: Event }>;

export function openContextMenu(
  e: EventWithDetail,
  track: Track | null,
  contextData: Partial<ContextMenuContext> = {},
): void {
  if (!track && contextData.type !== "playlist-card") return;

  vibrate();

  let clientX = 0;
  let clientY = 0;
  let rect: DOMRect | null = null;

  let el = (e.currentTarget as HTMLElement | null);
  if (!el && (e.target as HTMLElement)?.closest) {
    el = (e.target as HTMLElement).closest("button") || (e.target as HTMLElement);
  }

  if (el && el.getBoundingClientRect) {
    rect = el.getBoundingClientRect();
  }

  // Only the longpress CustomEvent carries an object detail with originalEvent;
  // for raw Mouse/Touch events `detail` is a number, so guard before reading it.
  const customDetail = (e as CustomEvent<{ originalEvent?: Event }>).detail;
  const evt: Event =
    customDetail && typeof customDetail === "object" && customDetail.originalEvent
      ? customDetail.originalEvent
      : e;
  if ((evt as TouchEvent).touches && (evt as TouchEvent).touches.length > 0) {
    clientX = (evt as TouchEvent).touches[0].clientX;
    clientY = (evt as TouchEvent).touches[0].clientY;
  } else if ((evt as MouseEvent).clientX) {
    clientX = (evt as MouseEvent).clientX;
    clientY = (evt as MouseEvent).clientY;
  }

  const ctx: ContextMenuContext = {
    type: "general",
    playlistName: null,
    index: null,
    ...contextData,
  };

  contextMenu.set({
    isOpen: true,
    track,
    context: ctx,
    x: clientX,
    y: clientY,
    triggerRect: rect,
  });
}

export function closeContextMenu(): void {
  contextMenu.set({
    isOpen: false,
    track: null,
    context: { type: "general" } as ContextMenuContext,
    x: 0,
    y: 0,
    triggerRect: null,
  });
}
