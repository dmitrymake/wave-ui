export const THEMES = [
  {
    id: "default",
    label: "Default (Moode Dark)",
    colors: {
      /* --- 0. ATOMIC TRANSPARENCIES --- */
      "--c-white-10": "rgba(255, 255, 255, 0.1)",
      "--c-white-20": "rgba(255, 255, 255, 0.2)",
      "--c-white-30": "rgba(255, 255, 255, 0.3)",
      "--c-white-50": "rgba(255, 255, 255, 0.5)",
      "--c-white-60": "rgba(255, 255, 255, 0.6)",
      "--c-white-90": "rgba(255, 255, 255, 0.9)",

      "--c-black-20": "rgba(0, 0, 0, 0.2)",
      "--c-black-50": "rgba(0, 0, 0, 0.5)",
      "--c-black-70": "rgba(0, 0, 0, 0.7)",
      "--c-black-80": "rgba(0, 0, 0, 0.8)",
      "--c-black-90": "rgba(0, 0, 0, 0.9)",

      /* --- 1. ACCENTS --- */
      "--c-accent": "#fa2d48",
      "--c-accent-hover": "#ff4d65",

      /* --- 2. TEXT --- */
      "--c-text-primary": "#ffffff",
      "--c-text-secondary": "rgba(255, 255, 255, 0.6)",
      "--c-text-muted": "#888888",
      "--c-text-inverse": "#000000",

      /* --- 3. BACKGROUNDS --- */
      "--c-bg-app": "#000000",
      "--c-bg-main": "#121212",
      "--c-bg-sidebar": "#000000",
      "--c-bg-card": "#1a1a1a",
      "--c-bg-placeholder": "rgba(255, 255, 255, 0.1)",
      "--c-bg-glass": "rgba(18, 18, 18, 0.95)",
      "--c-bg-toast": "#333333",

      "--c-heart": "#ff4444",
      "--c-error": "#ff4444",

      /* --- 4. INTERACTIVE SURFACES --- */
      "--c-surface-hover": "rgba(255, 255, 255, 0.1)",
      "--c-surface-active": "rgba(255, 255, 255, 0.2)",
      "--c-surface-input": "#1a1a1a",
      "--c-surface-input-focus": "rgba(255, 255, 255, 0.1)",
      "--c-surface-button": "rgba(255, 255, 255, 0.1)",
      "--c-surface-button-hover": "rgba(255, 255, 255, 0.1)",

      "--c-surface-drag-phantom": "#1a1a1a",
      "--c-surface-drag-land": "rgba(255, 255, 255, 0.1)",

      "--c-rail-bg": "rgba(255, 255, 255, 0.2)",
      "--c-rail-bg-hover": "rgba(255, 255, 255, 0.3)",

      "--c-skeleton-base": "rgba(255, 255, 255, 0.1)",

      /* --- 5. BORDERS --- */
      "--c-border": "rgba(255, 255, 255, 0.1)",
      "--c-border-dim": "rgba(255, 255, 255, 0.1)",
      "--c-border-bright": "rgba(255, 255, 255, 0.2)",
      "--c-border-dashed": "rgba(255, 255, 255, 0.2)",
      "--c-border-dashed-hover": "rgba(255, 255, 255, 0.5)",

      /* --- 6. OVERLAYS & SHADOWS --- */
      "--c-overlay-dim": "rgba(0, 0, 0, 0.5)",
      "--c-overlay-backdrop": "rgba(0, 0, 0, 0.8)",

      "--c-shadow-card": "rgba(0, 0, 0, 0.3)",
      "--c-shadow-popover": "rgba(0, 0, 0, 0.5)",
      "--c-shadow-header": "rgba(0, 0, 0, 0.5)",
      "--c-shadow-phantom": "rgba(0, 0, 0, 0.7)",
      "--c-shadow-glow-accent": "rgba(250, 45, 72, 0.5)",

      /* --- 7. ICONS --- */
      "--c-icon-idle": "#9ca3af",
      "--c-icon-hover": "#ffffff",
      "--c-icon-faint": "rgba(255, 255, 255, 0.5)",
      "--icon-stroke-width": "1.5px",

      /* --- 8. LAYOUT --- */
      "--header-height": "64px",
      "--mini-player-height": "90px",
      "--sidebar-width": "260px",

      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-xl": "20px",
      "--radius-full": "9999px",

      "--z-base": "1",
      "--z-dock": "1000",
      "--z-modal": "2000",
      "--z-toast": "3000",
      "--z-drag-item": "9999",

      "--trans-fast": "0.2s ease",
      "--trans-smooth": "0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",

      /* --- 9. PLAYLIST CARD PALETTE --- */
      "--c-pl-0": "#fa2d48",
      "--c-pl-1": "#2d7afa",
      "--c-pl-2": "#2dfa85",
      "--c-pl-3": "#faac2d",
      "--c-pl-4": "#b82dfa",
      "--c-pl-5": "#2dfaf3",
    },
  },
  {
    id: "gruvbox",
    label: "Gruvbox Dark",
    colors: {
      /* --- 0. ATOMIC TRANSPARENCIES --- */
      "--c-white-10": "rgba(251, 241, 199, 0.1)",
      "--c-white-20": "rgba(251, 241, 199, 0.2)",
      "--c-white-30": "rgba(251, 241, 199, 0.3)",
      "--c-white-50": "rgba(251, 241, 199, 0.5)",
      "--c-white-60": "rgba(251, 241, 199, 0.6)",
      "--c-white-90": "rgba(251, 241, 199, 0.9)",

      "--c-black-20": "rgba(40, 40, 40, 0.2)",
      "--c-black-50": "rgba(40, 40, 40, 0.5)",
      "--c-black-70": "rgba(40, 40, 40, 0.7)",
      "--c-black-80": "rgba(40, 40, 40, 0.8)",
      "--c-black-90": "rgba(40, 40, 40, 0.9)",

      /* --- 1. ACCENTS --- */
      "--c-accent": "#d65d0e",
      "--c-accent-hover": "#fe8019",

      /* --- 2. TEXT --- */
      "--c-text-primary": "#fbf1c7",
      "--c-text-secondary": "#ebdbb2",
      "--c-text-muted": "#928374",
      "--c-text-inverse": "#282828",

      /* --- 3. BACKGROUNDS --- */
      "--c-bg-app": "#282828",
      "--c-bg-main": "#282828",
      "--c-bg-sidebar": "#282828",
      "--c-bg-card": "#3c3836",
      "--c-bg-placeholder": "#504945",
      "--c-bg-glass": "rgba(40, 40, 40, 0.98)",
      "--c-bg-toast": "#32302f",

      "--c-heart": "#fb4934",
      "--c-error": "#cc241d",

      /* --- 4. INTERACTIVE SURFACES --- */
      "--c-surface-hover": "#3c3836",
      "--c-surface-active": "#504945",
      "--c-surface-input": "#3c3836",
      "--c-surface-input-focus": "#504945",
      "--c-surface-button": "rgba(251, 241, 199, 0.1)",
      "--c-surface-button-hover": "rgba(251, 241, 199, 0.2)",

      "--c-surface-drag-phantom": "#504945",
      "--c-surface-drag-land": "rgba(251, 241, 199, 0.1)",

      "--c-rail-bg": "#504945",
      "--c-rail-bg-hover": "#665c54",

      "--c-skeleton-base": "#3c3836",

      /* --- 5. BORDERS --- */
      "--c-border": "#504945",
      "--c-border-dim": "#3c3836",
      "--c-border-bright": "#665c54",
      "--c-border-dashed": "rgba(168, 153, 132, 0.2)",
      "--c-border-dashed-hover": "rgba(168, 153, 132, 0.5)",

      /* --- 6. OVERLAYS & SHADOWS --- */
      "--c-overlay-dim": "rgba(40, 40, 40, 0.6)",
      "--c-overlay-backdrop": "rgba(29, 32, 33, 0.8)",

      "--c-shadow-card": "rgba(0, 0, 0, 0.3)",
      "--c-shadow-popover": "rgba(0, 0, 0, 0.5)",
      "--c-shadow-header": "rgba(0, 0, 0, 0.2)",
      "--c-shadow-phantom": "rgba(0, 0, 0, 0.5)",
      "--c-shadow-glow-accent": "rgba(214, 93, 14, 0.3)",

      /* --- 7. ICONS --- */
      "--c-icon-idle": "#a89984",
      "--c-icon-hover": "#fbf1c7",
      "--c-icon-faint": "#504945",
      "--icon-stroke-width": "1.5px",

      /* --- 8. LAYOUT --- */
      "--header-height": "64px",
      "--mini-player-height": "90px",
      "--sidebar-width": "260px",

      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-xl": "16px",
      "--radius-full": "9999px",

      "--z-base": "1",
      "--z-dock": "1000",
      "--z-modal": "2000",
      "--z-toast": "3000",
      "--z-drag-item": "9999",

      "--trans-fast": "0.2s ease",
      "--trans-smooth": "0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",

      /* --- 9. PLAYLIST CARD PALETTE --- */
      "--c-pl-0": "#cc241d",
      "--c-pl-1": "#458588",
      "--c-pl-2": "#a6e3a1",
      "--c-pl-3": "#d65d0e",
      "--c-pl-4": "#b16286",
      "--c-pl-5": "#fabd2f",
    },
  },
];

export const THEME = {
  COLORS: {
    PRIMARY: "#fa2d48",
    HEART: "#ff4444",
    ERROR: "#ff4444",
  },
};
