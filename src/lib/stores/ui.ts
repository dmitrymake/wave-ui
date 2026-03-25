import { writable, get } from "svelte/store";
import { THEMES } from "../theme";
import type { ToastMessage, ModalState, ContextMenuState, ContextMenuContext, Track, Playlist } from "../types";


const savedTheme = localStorage.getItem("app_theme") || "default";
export const currentTheme = writable<string>(savedTheme);

currentTheme.subscribe((id: string) => {
  if (typeof document === "undefined") return;
  localStorage.setItem("app_theme", id);
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

const storedSidebar = localStorage.getItem("sidebarCollapsed") === "true";
export const isSidebarCollapsed = writable<boolean>(storedSidebar);

isSidebarCollapsed.subscribe((val: boolean) => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("sidebarCollapsed", String(val));
  }
});


export const contextMenu = writable<ContextMenuState>({
  isOpen: false,
  track: null,
  context: { type: "general", playlistName: null, index: null },
  x: 0,
  y: 0,
  triggerRect: null,
});

export const playlistSelector = writable<{ isOpen: boolean; track: Track | null }>({
  isOpen: false,
  track: null,
});

function vibrate(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(70);
    } catch (e) {}
  }
}

interface EventWithDetail extends Event {
  detail?: { originalEvent?: Event };
}

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

  const evt = e.detail?.originalEvent || e;
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

export function openPlaylistSelector(track: Track): void {
  closeContextMenu();
  playlistSelector.set({ isOpen: true, track });
}

export function closePlaylistSelector(): void {
  playlistSelector.set({ isOpen: false, track: null });
}
