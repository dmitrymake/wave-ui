// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
