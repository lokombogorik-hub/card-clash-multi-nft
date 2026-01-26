import React from 'react'
import { createRoot } from 'react-dom/client'

import process from 'process'
import { Buffer } from 'buffer'

// важно: globals ДО импорта App (иначе @here-wallet/core может падать при init)
globalThis.global = globalThis
globalThis.process = process
globalThis.Buffer = Buffer

if (!globalThis.process.env) globalThis.process.env = {}

function renderFatal(err) {
  try {
    const rootEl = document.getElementById('root')
    if (!rootEl) return

    const msg =
      err && (err.stack || err.message) ? (err.stack || err.message) : String(err)

    rootEl.innerHTML = `
      <div style="min-height:100vh;background:#050816;color:#E6F1FF;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">
        <div style="font-size:14px;opacity:.85;margin-bottom:8px;">Card Clash crashed:</div>
        <pre style="white-space:pre-wrap;word-break:break-word;line-height:1.35;margin:0;">${msg}</pre>
      </div>
    `
  } catch (_) {
    // ignore
  }
}

window.addEventListener('error', (e) => {
  renderFatal(e?.error || e?.message || e)
})

window.addEventListener('unhandledrejection', (e) => {
  renderFatal(e?.reason || e)
})

async function bootstrap() {
  try {
    await import('./index.css')
    const mod = await import('./App.jsx')
    const App = mod.default

    const rootEl = document.getElementById('root')
    createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  } catch (err) {
    console.error(err)
    renderFatal(err)
  }
}

bootstrap()