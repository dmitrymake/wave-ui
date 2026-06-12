// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { mount } from 'svelte'
import './app.css'
// Register all track sources (Yandex, ...) before any playback starts.
import './lib/sources'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

export default app
