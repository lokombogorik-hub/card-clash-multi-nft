import React from 'react'
import { createRoot } from 'react-dom/client'

import process from 'process'
import { Buffer } from 'buffer'

// globals ДО любых импортов app/libs
globalThis.global = globalThis
globalThis.process = process
globalThis.Buffer = Buffer
if (!globalThis.process.env) globalThis.process.env = {}

// === GLOBAL ERROR CATCHER (показываем все ошибки в UI) ===
window.__CARDCLASH_ERRORS__ = []

function captureError(source, error) {
  const err = {
    source,
    message: error?.message || String(error),
    stack: error?.stack || '',
    time: new Date().toISOString(),
  }

  console.error(`[GLOBAL ERROR] ${source}:`, error)

  if (!window.__CARDCLASH_ERRORS__) window.__CARDCLASH_ERRORS__ = []
  window.__CARDCLASH_ERRORS__.push(err)

  // Keep last 10
  if (window.__CARDCLASH_ERRORS__.length > 10) {
    window.__CARDCLASH_ERRORS__.shift()
  }

  // Trigger re-render if possible
  try {
    window.dispatchEvent(new Event('cardclash-error'))
  } catch { }
}

window.addEventListener('error', (e) => {
  captureError('window.error', e?.error || e?.message || e)
})

window.addEventListener('unhandledrejection', (e) => {
  captureError('unhandledrejection', e?.reason || e)
})

// === Error UI Overlay ===
function mountErrorOverlay() {
  const container = document.createElement('div')
  container.id = 'cardclash-error-overlay'
  container.style.cssText = `
    position: fixed;
    left: 10px;
    bottom: 10px;
    max-width: 400px;
    max-height: 50vh;
    overflow: auto;
    z-index: 9999999;
    background: rgba(139, 0, 0, 0.95);
    color: #fff;
    padding: 12px;
    border-radius: 12px;
    border: 2px solid rgba(255,255,255,0.3);
    font-family: monospace;
    font-size: 11px;
    line-height: 1.4;
    display: none;
  `
  document.body.appendChild(container)

  const render = () => {
    const errors = window.__CARDCLASH_ERRORS__ || []

    if (errors.length === 0) {
      container.style.display = 'none'
      return
    }

    container.style.display = 'block'

    container.innerHTML = `
      <div style="font-weight: 900; margin-bottom: 8px; font-size: 12px;">
        🔥 Errors (${errors.length})
        <button 
          onclick="window.__CARDCLASH_ERRORS__ = []; window.dispatchEvent(new Event('cardclash-error'))"
          style="float: right; padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); color: #fff; cursor: pointer; font-size: 10px;"
        >
          Clear
        </button>
      </div>
      ${errors.map((err, idx) => `
        <div style="margin-bottom: 10px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 8px;">
          <div style="font-weight: 800; color: #ffb3b3;">${idx + 1}. ${err.source}</div>
          <div style="margin-top: 4px;">${err.message}</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${err.time}</div>
          ${err.stack ? `
            <details style="margin-top: 6px;">
              <summary style="cursor: pointer; font-size: 10px; opacity: 0.8;">Stack</summary>
              <pre style="margin: 4px 0 0 0; font-size: 9px; line-height: 1.3; white-space: pre-wrap; word-break: break-word;">${err.stack}</pre>
            </details>
          ` : ''}
        </div>
      `).join('')}
    `
  }

  window.addEventListener('cardclash-error', render)

  // Initial render
  setTimeout(render, 100)

  // Poll every 1s (in case errors come async)
  setInterval(render, 1000)
}

// Mount error overlay when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountErrorOverlay)
} else {
  mountErrorOverlay()
}

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
    captureError('bootstrap', err)
    renderFatal(err)
  }
}

bootstrap()