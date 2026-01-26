import React from 'react'
import { createRoot } from 'react-dom/client'

import process from 'process'
import { Buffer } from 'buffer'

// globals ДО любых импортов app/libs
globalThis.global = globalThis
globalThis.process = process
globalThis.Buffer = Buffer
if (!globalThis.process.env) globalThis.process.env = {}

// hard requirement from you: open exactly @hot_wallet mini app
const HOT_WALLET_DOMAIN = 'hot_wallet'

// debug marker to verify that THIS build is loaded
window.__CC_HOT_PATCH_VERSION__ = 'hotwallet-intercept-v4'

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

function mapHereRequestToHotWallet(url) {
  const id = extractHereRequestId(url)
  if (!id) return null
  return `https://t.me/${HOT_WALLET_DOMAIN}/app?startapp=${encodeURIComponent(id)}`
}

function openHotWalletOverlay(mappedUrl) {
  try {
    const tg = window.Telegram?.WebApp
    if (tg) {
      try {
        tg.expand?.()
      } catch {
        // ignore
      }
      if (typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(mappedUrl)
        return true
      }
      if (typeof tg.openLink === 'function') {
        tg.openLink(mappedUrl)
        return true
      }
    }
  } catch {
    // ignore
  }

  // fallback for non-Telegram environments (PC browser etc.)
  try {
    window.open(mappedUrl, '_blank', 'noopener,noreferrer')
    return true
  } catch {
    return false
  }
}

function handlePossibleHereUrl(url, source = 'unknown') {
  const mapped = mapHereRequestToHotWallet(url)
  if (!mapped) return false

  window.__CC_LAST_HERE_REQUEST__ = { url: String(url), mapped, source, ts: Date.now() }
  return openHotWalletOverlay(mapped)
}

function patchTelegramOpenLinkWhenAvailable() {
  const tg = window.Telegram?.WebApp
  if (!tg) return false

  // patch WebApp.openLink (some libs call this directly)
  if (typeof tg.openLink === 'function' && !tg.__cc_patched_openLink) {
    const orig = tg.openLink.bind(tg)
    tg.openLink = (url, opts) => {
      if (handlePossibleHereUrl(url, 'Telegram.WebApp.openLink')) return
      return orig(url, opts)
    }
    tg.__cc_patched_openLink = true
  }

  // patch WebApp.openTelegramLink too (just in case something passes herewallet url into it)
  if (typeof tg.openTelegramLink === 'function' && !tg.__cc_patched_openTelegramLink) {
    const orig = tg.openTelegramLink.bind(tg)
    tg.openTelegramLink = (url) => {
      if (handlePossibleHereUrl(url, 'Telegram.WebApp.openTelegramLink')) return
      return orig(url)
    }
    tg.__cc_patched_openTelegramLink = true
  }

  return true
}

function patchBrowserNav() {
  // window.open
  try {
    const origOpen = window.open?.bind(window)
    window.open = (url, target, features) => {
      if (handlePossibleHereUrl(url, 'window.open')) return null
      return origOpen ? origOpen(url, target, features) : null
    }
  } catch {
    // ignore
  }

  // location.assign/replace
  try {
    const loc = window.location
    const origAssign = loc.assign?.bind(loc)
    const origReplace = loc.replace?.bind(loc)

    if (origAssign) {
      loc.assign = (url) => {
        if (handlePossibleHereUrl(url, 'location.assign')) return
        return origAssign(url)
      }
    }
    if (origReplace) {
      loc.replace = (url) => {
        if (handlePossibleHereUrl(url, 'location.replace')) return
        return origReplace(url)
      }
    }
  } catch {
    // ignore
  }

  // clicks on <a href>
  try {
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target?.closest?.('a')
        const href = a?.getAttribute?.('href')
        if (!href) return
        if (!href.includes('herewallet.app/request/')) return

        e.preventDefault()
        e.stopPropagation()
        handlePossibleHereUrl(href, 'a[href] click')
      },
      true
    )
  } catch {
    // ignore
  }
}

function patchElementSrcHrefSetters() {
  // intercept element.setAttribute('src'/'href', ...)
  try {
    const origSetAttr = Element.prototype.setAttribute
    if (!Element.prototype.__cc_patched_setAttribute) {
      Element.prototype.setAttribute = function (name, value) {
        try {
          const n = String(name || '').toLowerCase()
          if ((n === 'src' || n === 'href') && typeof value === 'string') {
            if (handlePossibleHereUrl(value, `setAttribute(${n})`)) {
              // block setting real herewallet url
              return
            }
          }
        } catch {
          // ignore
        }
        return origSetAttr.call(this, name, value)
      }
      Element.prototype.__cc_patched_setAttribute = true
    }
  } catch {
    // ignore
  }

  // intercept iframe.src property assignment (iframe.src = "https://my.herewallet.app/request/...")
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')
    if (desc && desc.set && !HTMLIFrameElement.prototype.__cc_patched_iframe_src) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
        get: desc.get,
        set: function (value) {
          if (typeof value === 'string' && handlePossibleHereUrl(value, 'iframe.src setter')) {
            // block
            return
          }
          return desc.set.call(this, value)
        },
        configurable: true,
        enumerable: desc.enumerable,
      })
      HTMLIFrameElement.prototype.__cc_patched_iframe_src = true
    }
  } catch {
    // ignore
  }

  // intercept anchor.href assignment (a.href = ...)
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'href')
    if (desc && desc.set && !HTMLAnchorElement.prototype.__cc_patched_anchor_href) {
      Object.defineProperty(HTMLAnchorElement.prototype, 'href', {
        get: desc.get,
        set: function (value) {
          if (typeof value === 'string' && handlePossibleHereUrl(value, 'a.href setter')) {
            return
          }
          return desc.set.call(this, value)
        },
        configurable: true,
        enumerable: desc.enumerable,
      })
      HTMLAnchorElement.prototype.__cc_patched_anchor_href = true
    }
  } catch {
    // ignore
  }
}

function watchDomForHereRequestUrls() {
  const scanEl = (el) => {
    if (!el || el.nodeType !== 1) return

    const href = el.getAttribute?.('href')
    const src = el.getAttribute?.('src')
    if (href) handlePossibleHereUrl(href, 'DOM scan href')
    if (src) handlePossibleHereUrl(src, 'DOM scan src')

    const q = el.querySelectorAll?.('[href*="herewallet.app/request/"], [src*="herewallet.app/request/"]')
    if (q && q.length) {
      q.forEach((x) => {
        const h = x.getAttribute?.('href')
        const s = x.getAttribute?.('src')
        if (h) handlePossibleHereUrl(h, 'DOM query href')
        if (s) handlePossibleHereUrl(s, 'DOM query src')
      })
    }
  }

  try {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes?.forEach((n) => scanEl(n))
        } else if (m.type === 'attributes') {
          const t = m.target
          if (!t || t.nodeType !== 1) continue
          const v = t.getAttribute?.(m.attributeName)
          if (v) handlePossibleHereUrl(v, `attr:${m.attributeName}`)
        }
      }
    })

    obs.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'href'],
    })

    // initial scan
    scanEl(document.documentElement)
  } catch {
    // ignore
  }
}

// install patches ASAP
patchBrowserNav()
patchElementSrcHrefSetters()
watchDomForHereRequestUrls()

// Telegram object may appear after start; poll a bit to patch openLink
{
  let tries = 0
  const t = setInterval(() => {
    tries += 1
    patchTelegramOpenLinkWhenAvailable()
    if (tries >= 40) clearInterval(t) // ~10s
  }, 250)
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