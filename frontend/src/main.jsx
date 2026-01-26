import React from 'react'
import { createRoot } from 'react-dom/client'

import process from 'process'
import { Buffer } from 'buffer'

// globals ДО любых импортов app/libs
globalThis.global = globalThis
globalThis.process = process
globalThis.Buffer = Buffer
if (!globalThis.process.env) globalThis.process.env = {}

// === Telegram WebView cache busting (чтобы изменения реально применялись) ===
function ensureTelegramCacheBustOnce() {
  try {
    const tg = window.Telegram?.WebApp
    if (!tg) return

    const u = new URL(window.location.href)
    if (u.searchParams.has('v')) return

    const key = 'cc_cache_bust_v'
    const v = sessionStorage.getItem(key) || Date.now().toString(36)
    sessionStorage.setItem(key, v)

    u.searchParams.set('v', v)
    window.location.replace(u.toString())
  } catch {
    // ignore
  }
}
ensureTelegramCacheBustOnce()

// === HERE request -> HOT Wallet mini app mapping ===
const HOT_WALLET_DOMAIN = 'hot_wallet' // строго как ты просишь: @hot_wallet

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

  try {
    tg.expand?.()
  } catch {
    // ignore
  }

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

// Перехватываем ВСЕ стандартные способы открыть ссылку
function patchOpensEarly() {
  // 1) Telegram.WebApp.openLink
  try {
    const tg = window.Telegram?.WebApp
    if (tg && typeof tg.openLink === 'function') {
      const orig = tg.openLink.bind(tg)
      tg.openLink = (url, opts) => {
        const mapped = toHotWalletMiniAppLinkFromHereRequest(url)
        if (mapped) {
          window.__CC_LAST_HERE_REQUEST__ = { url: String(url), mapped }
          tgOpenOverlay(mapped)
          return
        }
        return orig(url, opts)
      }
    }
  } catch {
    // ignore
  }

  // 2) window.open
  try {
    const origOpen = window.open?.bind(window)
    window.open = (url, target, features) => {
      const mapped = toHotWalletMiniAppLinkFromHereRequest(url)
      if (mapped) {
        window.__CC_LAST_HERE_REQUEST__ = { url: String(url), mapped }
        tgOpenOverlay(mapped)
        return null
      }
      return origOpen ? origOpen(url, target, features) : null
    }
  } catch {
    // ignore
  }

  // 3) location.assign/replace
  try {
    const loc = window.location
    const origAssign = loc.assign?.bind(loc)
    const origReplace = loc.replace?.bind(loc)

    if (origAssign) {
      loc.assign = (url) => {
        const mapped = toHotWalletMiniAppLinkFromHereRequest(url)
        if (mapped) {
          window.__CC_LAST_HERE_REQUEST__ = { url: String(url), mapped }
          tgOpenOverlay(mapped)
          return
        }
        return origAssign(url)
      }
    }

    if (origReplace) {
      loc.replace = (url) => {
        const mapped = toHotWalletMiniAppLinkFromHereRequest(url)
        if (mapped) {
          window.__CC_LAST_HERE_REQUEST__ = { url: String(url), mapped }
          tgOpenOverlay(mapped)
          return
        }
        return origReplace(url)
      }
    }
  } catch {
    // ignore
  }

  // 4) клики по <a href="...">
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

        window.__CC_LAST_HERE_REQUEST__ = { url: String(href), mapped }
        tgOpenOverlay(mapped)
      },
      true
    )
  } catch {
    // ignore
  }
}

// Ловим появление HERE request URL в DOM даже если это iframe/src (клик внутри iframe не перехватывается!)
function autoOpenHotWalletWhenHereRequestAppears() {
  const openedIds = new Set()

  const tryHandleUrl = (url) => {
    const requestId = extractHereRequestId(url)
    if (!requestId) return false
    if (openedIds.has(requestId)) return true

    openedIds.add(requestId)
    const mapped = `https://t.me/${HOT_WALLET_DOMAIN}/app?startapp=${encodeURIComponent(requestId)}`
    window.__CC_LAST_HERE_REQUEST__ = { url: String(url), mapped }

    tgOpenOverlay(mapped)
    return true
  }

  const tryHandleNode = (node) => {
    if (!node) return

    // direct element
    if (node.nodeType === 1) {
      const el = node

      // href/src on the element itself
      const href = el.getAttribute?.('href')
      const src = el.getAttribute?.('src')
      if (href && tryHandleUrl(href)) {
        try {
          el.style.display = 'none'
          el.style.visibility = 'hidden'
          el.style.pointerEvents = 'none'
        } catch {
          // ignore
        }
      }
      if (src && tryHandleUrl(src)) {
        try {
          el.style.display = 'none'
          el.style.visibility = 'hidden'
          el.style.pointerEvents = 'none'
        } catch {
          // ignore
        }
      }

      // scan descendants for any href/src that contains herewallet request
      const q = el.querySelectorAll?.(
        'a[href*="herewallet.app/request/"], iframe[src*="herewallet.app/request/"], img[src*="herewallet.app/request/"], source[src*="herewallet.app/request/"]'
      )
      if (q && q.length) {
        q.forEach((x) => {
          const h = x.getAttribute?.('href')
          const s = x.getAttribute?.('src')
          if (h && tryHandleUrl(h)) {
            try {
              x.style.display = 'none'
              x.style.visibility = 'hidden'
              x.style.pointerEvents = 'none'
            } catch { }
          }
          if (s && tryHandleUrl(s)) {
            try {
              x.style.display = 'none'
              x.style.visibility = 'hidden'
              x.style.pointerEvents = 'none'
            } catch { }
          }
        })
      }
    }
  }

  // супер-важно: перехватываем setAttribute('src'/'href', ...) когда HERE вставляет iframe динамически
  try {
    const origSetAttr = Element.prototype.setAttribute
    Element.prototype.setAttribute = function (name, value) {
      try {
        const n = String(name || '').toLowerCase()
        if ((n === 'href' || n === 'src') && typeof value === 'string') {
          if (tryHandleUrl(value)) {
            // не даём реально установить src/href на herewallet request (чтобы iframe не загрузился)
            return
          }
        }
      } catch {
        // ignore
      }
      return origSetAttr.call(this, name, value)
    }
  } catch {
    // ignore
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

    // initial scan
    tryHandleNode(document.documentElement)
  } catch {
    // ignore
  }
}

patchOpensEarly()
autoOpenHotWalletWhenHereRequestAppears()

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