# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Wave UI — a lightweight Svelte 5 SPA for moOde Audio player. Communicates with MPD via WebSockets (through websockify) and with moOde's PHP backend via REST APIs.

## Commands

```bash
npm run dev          # Dev server on port 4567 (proxies API to moOde at 192.168.1.100)
npm run build        # Production build to dist/
npm run preview      # Preview production build
npm run test         # Vitest in watch mode
npm run test:run     # Single test run
npm run check        # svelte-check type checking
```

Run a single test file: `npx vitest run src/lib/__tests__/somefile.test.ts`

## Architecture

**Frontend stack**: Svelte 5 (runes: `$state`, `$derived`) + TypeScript (strict) + Vite. Single production dependency: `md5`.

**Key directories**:
- `src/components/` — Svelte components; `views/` subdirectory holds page-level views
- `src/lib/stores/` — Svelte writable stores split by domain: `ui`, `player`, `library`, `settings`, `yandex`
- `src/lib/mpd/` — MPD WebSocket protocol client (direct binary protocol over websockify)
- `src/lib/workers/` — Web Worker for background library sync (keeps UI unblocked)
- `src/lib/` — Core logic: `api.ts` (sync orchestration), `db.ts` (IndexedDB), `router.ts` (hash-based routing), `theme.ts`, `types.ts`, `constants.ts`
- `src/api/` — PHP backend files deployed to `/var/www/` on moOde
- `src/styles/` — Shared CSS; `MusicViews.css` is the largest shared stylesheet

**Data flow**:
1. Library metadata syncs from moOde PHP API → Web Worker → IndexedDB ("MoodePlayerDB")
2. Playback control goes directly to MPD via WebSocket (port 8080)
3. Cover art is cached by a Service Worker (`sw.js`)

**Routing**: Hash-based (`/#/view/param1/param2`) implemented in `src/lib/router.ts`. No router library.

**Theming**: CSS custom properties defined in `src/lib/theme.ts`. Two themes: "default" and "gruvbox". Theme ID persisted in localStorage.

**PWA**: Service worker caches cover art and images. Manifest at `public/manifest.webmanifest`.

## Deployment

Production runs on moOde device: Nginx serves static files on port 3000 (SSL: 3443), PHP-FPM handles API, websockify bridges MPD on port 8080. Deployment scripts: `install.sh` (full setup) and `install_dev.sh` (update only).

## Testing

Vitest with jsdom environment and fake-indexeddb. Tests live in `src/lib/__tests__/`. Setup file imports fake-indexeddb polyfill. Path alias `$lib` maps to `src/lib` in test config.
