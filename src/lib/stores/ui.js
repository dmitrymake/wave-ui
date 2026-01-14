import { writable, get } from "svelte/store";
import { THEMES } from "../theme";

// --- THEMES ---
const savedTheme = localStorage.getItem("app_theme") || "default";
export const currentTheme = writable(savedTheme);

currentTheme.subscribe((id) => {
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

// --- TOASTS ---
export const toastMessage = writable(null);
let toastTimer;

export function showToast(msg, type = "info") {
  toastMessage.set({ text: msg, type });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.set(null);
  }, 3000);
}

// --- MODALS ---
export const modal = writable({
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
  type = "confirm",
  inputValue = "",
  placeholder = "",
  options = [],
  onConfirm = () => {},
}) {
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

export function closeModal() {
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

// --- LAYOUT STATE ---
export const isFullPlayerOpen = writable(false);
export const activeMenuTab = writable("library");
export const connectionStatus = writable("Disconnected");

const storedSidebar = localStorage.getItem("sidebarCollapsed") === "true";
export const isSidebarCollapsed = writable(storedSidebar);

isSidebarCollapsed.subscribe((val) => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("sidebarCollapsed", String(val));
  }
});

// --- CONTEXT MENU & SELECTORS ---
export const contextMenu = writable({
  isOpen: false,
  track: null,
  context: { type: "general", playlistName: null, index: null },
  x: 0,
  y: 0,
  triggerRect: null,
});

export const playlistSelector = writable({
  isOpen: false,
  track: null,
});

function vibrate() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(70);
    } catch (e) {}
  }
}

export function openContextMenu(e, track, contextData = {}) {
  if (!track && contextData.type !== "playlist-card") return;

  vibrate();

  let clientX = 0;
  let clientY = 0;
  let rect = null;

  let el = e.currentTarget;
  if (!el && e.target && e.target.closest) {
    el = e.target.closest("button") || e.target;
  }

  if (el && el.getBoundingClientRect) {
    rect = el.getBoundingClientRect();
  }

  const evt = e.detail?.originalEvent || e;
  if (evt.touches && evt.touches.length > 0) {
    clientX = evt.touches[0].clientX;
    clientY = evt.touches[0].clientY;
  } else if (evt.clientX) {
    clientX = evt.clientX;
    clientY = evt.clientY;
  }

  const ctx = {
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

export function closeContextMenu() {
  contextMenu.set({
    isOpen: false,
    track: null,
    context: {},
    x: 0,
    y: 0,
    triggerRect: null,
  });
}

export function openPlaylistSelector(track) {
  closeContextMenu();
  playlistSelector.set({ isOpen: true, track });
}

export function closePlaylistSelector() {
  playlistSelector.set({ isOpen: false, track: null });
}
