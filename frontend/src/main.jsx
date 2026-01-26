import React from 'react'
import { createRoot } from 'react-dom/client'

import process from 'process'
import { Buffer } from 'buffer'

// globals ДО любых импортов app/libs
globalThis.global = globalThis
globalThis.process = process
globalThis.Buffer = Buffer
if (!globalThis.process.env) globalThis.process.env = {}

// allow override, but default exactly what you asked: @hot_wallet mini app
const HOT_WALLET_DOMAIN = String(import.meta.env.VITE_HOT_WALLET_TG_DOMAIN || 'hot_wallet').trim()

function extractHereRequestId(url) {
  try {
    const u = new URL(String(url))
    const host = (u.hostname || '').toLowerCase()
    if (!host.endsWith('herewallet.app')) return null
    const m = (u.pathname || '').match(/\/request\/([^/?#]+)/i)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function toHotWalletMiniAppLinkFromHereRequest(url) {
  const requestId = extractHereRequestId(url)
  if (!requestId) return null
  return `https://t.me/${HOT_WALLET_DOMAIN}/app?startapp=${encodeURIComponent(requestId)}`
}

function tgOpenOverlay(url) {
  const tg = window.Telegram?.WebApp
  if (!tg) return false
  if (typeof tg.openTelegramLink === 'function') {
    tg.openTelegramLink(url)
    return true
  }
  if (typeof tg.openLink === 'function') {
    tg.openLink(url)
    return true
  }
  return false
}

function patchOpensEarly() {
  // patch Telegram.WebApp.openLink -> if HERE request URL, open hot_wallet overlay instead
  try {
    const tg = window.Telegram?.WebApp
    if (tg && typeof tg.openLink === 'function') {
      const orig = tg.openLink.bind(tg)
      tg.openLink = (url, opts) => {
        const mapped = toHotWalletMiniAppLinkFromHereRequest(url)
        if (mapped) {
          tgOpenOverlay(mapped)
          return
        }
        return orig(url, opts)
      }
    }
  } catch {
    // ignore
  }

  // patch window.open
  try {
    const origOpen = window.open?.bind(window)
    window.open = (url, target, features) => {
      const mapped = toHotWalletMiniAppLinkFromHereRequest(url)
      if (mapped) {
        tgOpenOverlay(mapped)
        return null
      }
      return origOpen ? origOpen(url, target, features) : null
    }
  } catch {
    // ignore
  }

  // patch clicks on <a href="https://my.herewallet.app/request/...">
  try {
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target?.closest?.('a')
        const href = a?.getAttribute?.('href')
        if (!href) return
        const mapped = toHotWalletMiniAppLinkFromHereRequest(href)
        if (!mapped) return
        e.preventDefault()
        e.stopPropagation()
        tgOpenOverlay(mapped)
      },
      true
    )
  } catch {
    // ignore
  }
}

function autoOpenHotWalletWhenHereModalAppears() {
  const opened = new Set()

  const tryHandleNode = (root) => {
    if (!root) return

    // find request links
    const links = []
    if (root.nodeType === 1) {
      // Element
      if (root.tagName === 'A') links.push(root)
      const q = root.querySelectorAll?.('a[href*="herewallet.app/request/"]')
      if (q && q.length) q.forEach((x) => links.push(x))
    }

    for (const a of links) {
      const href = a?.getAttribute?.('href') || ''
      const reqId = extractHereRequestId(href)
      if (!reqId) continue
      if (opened.has(reqId)) continue
      opened.add(reqId)

      const mapped = `https://t.me/${HOT_WALLET_DOMAIN}/app?startapp=${encodeURIComponent(reqId)}`

      // hide/remove the HERE QR modal ASAP (so user doesn't see it)
      try {
        // attempt to hide nearest fixed/overlay container
        let el = a
        for (let i = 0; i < 8 && el && el !== document.body; i++) {
          const st = window.getComputedStyle?.(el)
          if (st && (st.position === 'fixed' || st.position === 'absolute')) {
            el.style.display = 'none'
            el.style.visibility = 'hidden'
            el.style.pointerEvents = 'none'
            break
          }
          el = el.parentElement
        }
      } catch {
        // ignore
      }

      // open HOT wallet overlay (CapsGame-style)
      try {
        window.Telegram?.WebApp?.expand?.()
      } catch {
        // ignore
      }

      tgOpenOverlay(mapped)
    }
  }

  try {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach((n) => tryHandleNode(n))
        }
      }
    })
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true })

    // also scan once (in case modal already exists)
    tryHandleNode(document.documentElement)
  } catch {
    // ignore
  }
}

patchOpensEarly()
autoOpenHotWalletWhenHereModalAppears()

function renderFatal(err) {
  try {
    const rootEl = document.getElementById('root')
    if (!rootEl) return

    const msg = err && (err.stack || err.message) ? (err.stack || err.message) : String(err)

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