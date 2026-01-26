import React from 'react'
import { createRoot } from 'react-dom/client'

import process from 'process'
import { Buffer } from 'buffer'

// важно: globals ДО любых импортов app/libs
globalThis.global = globalThis
globalThis.process = process
globalThis.Buffer = Buffer
if (!globalThis.process.env) globalThis.process.env = {}

function extractHereRequestId(url) {
  try {
    const u = new URL(String(url))
    const host = (u.hostname || '').toLowerCase()
    if (!host.endsWith('herewallet.app')) return null

    // /request/<id>
    const m = (u.pathname || '').match(/\/request\/([^/?#]+)/i)
    if (!m) return null

    return m[1]
  } catch {
    return null
  }
}

function toHotWalletMiniAppLinkFromHereRequest(url) {
  const requestId = extractHereRequestId(url)
  if (!requestId) return null
  return `https://t.me/hot_wallet/app?startapp=${encodeURIComponent(requestId)}`
}

function patchTelegramOpensEarly() {
  // 1) patch Telegram.WebApp.openLink (чтобы не уходило в браузер)
  try {
    const tg = window.Telegram?.WebApp
    if (tg && typeof tg.openLink === 'function') {
      const orig = tg.openLink.bind(tg)
      tg.openLink = (url, opts) => {
        const mapped = toHotWalletMiniAppLinkFromHereRequest(url)
        if (mapped && typeof tg.openTelegramLink === 'function') {
          tg.openTelegramLink(mapped)
          return
        }
        return orig(url, opts)
      }
    }
  } catch {
    // ignore
  }

  // 2) patch window.open
  try {
    const origOpen = window.open?.bind(window)
    window.open = (url, target, features) => {
      try {
        const tg = window.Telegram?.WebApp
        const mapped = toHotWalletMiniAppLinkFromHereRequest(url)
        if (mapped && tg?.openTelegramLink) {
          tg.openTelegramLink(mapped)
          return null
        }
      } catch {
        // ignore
      }
      return origOpen ? origOpen(url, target, features) : null
    }
  } catch {
    // ignore
  }

  // 3) перехват кликов по ссылкам (если внутри HERE-оверлея это <a href="...">)
  try {
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target?.closest?.('a')
        const href = a?.getAttribute?.('href')
        if (!href) return

        const mapped = toHotWalletMiniAppLinkFromHereRequest(href)
        if (!mapped) return

        const tg = window.Telegram?.WebApp
        if (tg?.openTelegramLink) {
          e.preventDefault()
          e.stopPropagation()
          tg.openTelegramLink(mapped)
        }
      },
      true
    )
  } catch {
    // ignore
  }
}

patchTelegramOpensEarly()

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