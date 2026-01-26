import React from 'react'
import { createRoot } from 'react-dom/client'

import process from 'process'
import { Buffer } from 'buffer'

// globals ДО любых импортов app/libs
globalThis.global = globalThis
globalThis.process = process
globalThis.Buffer = Buffer
if (!globalThis.process.env) globalThis.process.env = {}

// === PATCH VERSION (чтобы ты видел, что реально загрузилась новая сборка) ===
const PATCH_VERSION = 'hotwallet-open-v6'
window.__CC_HOTWALLET_PATCH__ = PATCH_VERSION

// === Telegram WebView cache busting (иначе Telegram реально может держать старый bundle) ===
function ensureTelegramCacheBustOnce() {
  try {
    const tg = window.Telegram?.WebApp
    if (!tg) return
    const u = new URL(window.location.href)
    if (u.searchParams.has('v')) return

    const v = Date.now().toString(36)
    u.searchParams.set('v', v)
    window.location.replace(u.toString())
  } catch {
    // ignore
  }
}
ensureTelegramCacheBustOnce()

// === HERE request -> HOT Wallet mini app mapping ===
const HOT_WALLET_DOMAIN = 'hot_wallet' // строго то, что ты хочешь

function extractHereRequestId(inputUrl) {
  try {
    const u = new URL(String(inputUrl))
    const host = (u.hostname || '').toLowerCase()
    if (host !== 'my.herewallet.app') return null

    // /request/<id>
    const m = (u.pathname || '').match(/^\/request\/([^/?#]+)/i)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function mapHereToHotWalletMiniapp(inputUrl) {
  const id = extractHereRequestId(inputUrl)
  if (!id) return null
  // ВАЖНО: encodeURIComponent сохраняет '+' корректно как %2B
  return `https://t.me/${HOT_WALLET_DOMAIN}/app?startapp=${encodeURIComponent(id)}`
}

function openTelegramOverlay(url) {
  const tg = window.Telegram?.WebApp

  // внутри Telegram — обязательно openTelegramLink (как @CapsGame)
  if (tg?.openTelegramLink) {
    try {
      tg.expand?.()
    } catch {
      // ignore
    }
    tg.openTelegramLink(url)
    return true
  }

  // fallback: если тест на ПК НЕ внутри Telegram — просто откроем t.me ссылку
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  } catch {
    return false
  }
}

function handlePossibleHereRequest(url, source) {
  const mapped = mapHereToHotWalletMiniapp(url)
  if (!mapped) return false

  window.__CC_LAST_HERE__ = { url: String(url), mapped, source, ts: Date.now() }
  openTelegramOverlay(mapped)

  // Пытаемся скрыть/не показывать HERE QR overlay в нашем DOM (если он есть)
  try {
    const ifr = document.querySelector?.('iframe[src*="my.herewallet.app/request/"]')
    if (ifr) {
      ifr.style.display = 'none'
      ifr.style.visibility = 'hidden'
      ifr.style.pointerEvents = 'none'
    }
  } catch {
    // ignore
  }

  return true
}

// === ЖЁСТКИЙ перехват всех путей, которыми HERE может дернуть request URL ===
function installHardInterceptors() {
  // 1) window.open
  try {
    const orig = window.open?.bind(window)
    window.open = (url, target, features) => {
      if (handlePossibleHereRequest(url, 'window.open')) return null
      return orig ? orig(url, target, features) : null
    }
  } catch {
    // ignore
  }

  // 2) location.assign/replace
  try {
    const loc = window.location
    const origAssign = loc.assign?.bind(loc)
    const origReplace = loc.replace?.bind(loc)

    if (origAssign) {
      loc.assign = (url) => {
        if (handlePossibleHereRequest(url, 'location.assign')) return
        return origAssign(url)
      }
    }

    if (origReplace) {
      loc.replace = (url) => {
        if (handlePossibleHereRequest(url, 'location.replace')) return
        return origReplace(url)
      }
    }
  } catch {
    // ignore
  }

  // 3) fetch (вдруг HERE пытается загрузить request или related endpoints)
  try {
    const origFetch = window.fetch?.bind(window)
    if (origFetch && !window.__CC_PATCHED_FETCH__) {
      window.fetch = (input, init) => {
        try {
          const url = typeof input === 'string' ? input : (input?.url || '')
          if (handlePossibleHereRequest(url, 'fetch')) {
            // не ломаем логику: просто продолжаем оригинальный fetch
          }
        } catch {
          // ignore
        }
        return origFetch(input, init)
      }
      window.__CC_PATCHED_FETCH__ = true
    }
  } catch {
    // ignore
  }

  // 4) XHR.open
  try {
    const origOpen = XMLHttpRequest.prototype.open
    if (origOpen && !XMLHttpRequest.prototype.__CC_PATCHED_XHR__) {
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        try {
          handlePossibleHereRequest(url, 'xhr.open')
        } catch {
          // ignore
        }
        return origOpen.call(this, method, url, ...rest)
      }
      XMLHttpRequest.prototype.__CC_PATCHED_XHR__ = true
    }
  } catch {
    // ignore
  }

  // 5) Element.setAttribute('src'/'href') — ловим iframe/src и ссылки
  try {
    const origSet = Element.prototype.setAttribute
    if (origSet && !Element.prototype.__CC_PATCHED_SETATTR__) {
      Element.prototype.setAttribute = function (name, value) {
        try {
          const n = String(name || '').toLowerCase()
          if ((n === 'src' || n === 'href') && typeof value === 'string') {
            if (handlePossibleHereRequest(value, `setAttribute(${n})`)) {
              // блокируем установку src/href на herewallet request
              return
            }
          }
        } catch {
          // ignore
        }
        return origSet.call(this, name, value)
      }
      Element.prototype.__CC_PATCHED_SETATTR__ = true
    }
  } catch {
    // ignore
  }

  // 6) iframe.src setter (iframe.src = ...)
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')
    if (desc?.set && !HTMLIFrameElement.prototype.__CC_PATCHED_IFRAME_SRC__) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
        get: desc.get,
        set: function (value) {
          if (typeof value === 'string' && handlePossibleHereRequest(value, 'iframe.src')) {
            return
          }
          return desc.set.call(this, value)
        },
        configurable: true,
        enumerable: true,
      })
      HTMLIFrameElement.prototype.__CC_PATCHED_IFRAME_SRC__ = true
    }
  } catch {
    // ignore
  }

  // 7) MutationObserver: если HERE вставляет DOM уже с src/href
  try {
    const scan = (node) => {
      if (!node || node.nodeType !== 1) return

      const el = node
      const src = el.getAttribute?.('src')
      const href = el.getAttribute?.('href')
      if (src) handlePossibleHereRequest(src, 'dom.scan src')
      if (href) handlePossibleHereRequest(href, 'dom.scan href')

      const q = el.querySelectorAll?.('[src*="my.herewallet.app/request/"],[href*="my.herewallet.app/request/"]')
      if (q?.length) {
        q.forEach((x) => {
          const s = x.getAttribute?.('src')
          const h = x.getAttribute?.('href')
          if (s) handlePossibleHereRequest(s, 'dom.query src')
          if (h) handlePossibleHereRequest(h, 'dom.query href')
        })
      }
    }

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes?.length) m.addedNodes.forEach((n) => scan(n))
        if (m.type === 'attributes') {
          const t = m.target
          if (t?.getAttribute) {
            const v = t.getAttribute(m.attributeName)
            if (v) handlePossibleHereRequest(v, `dom.attr:${m.attributeName}`)
          }
        }
      }
    })

    obs.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'href'],
    })

    scan(document.documentElement)
  } catch {
    // ignore
  }

  // 8) Telegram.WebApp.openLink/openTelegramLink может появиться позже — пропатчим лениво
  try {
    let tries = 0
    const t = setInterval(() => {
      tries += 1
      const tg = window.Telegram?.WebApp
      if (tg?.openLink && !tg.__CC_PATCHED_OPENLINK__) {
        const orig = tg.openLink.bind(tg)
        tg.openLink = (url, opts) => {
          if (handlePossibleHereRequest(url, 'Telegram.WebApp.openLink')) return
          return orig(url, opts)
        }
        tg.__CC_PATCHED_OPENLINK__ = true
      }
      if (tg?.openTelegramLink && !tg.__CC_PATCHED_OPENTELEGRAMLINK__) {
        const orig = tg.openTelegramLink.bind(tg)
        tg.openTelegramLink = (url) => {
          if (handlePossibleHereRequest(url, 'Telegram.WebApp.openTelegramLink')) return
          return orig(url)
        }
        tg.__CC_PATCHED_OPENTELEGRAMLINK__ = true
      }

      if (tries >= 60) clearInterval(t) // ~15s
    }, 250)
  } catch {
    // ignore
  }
}

installHardInterceptors()

// === UI бейдж (чтобы ты ВИДЕЛ изменения) ===
function mountPatchBadge() {
  try {
    const el = document.createElement('div')
    el.id = 'cc-hotwallet-patch-badge'
    el.style.position = 'fixed'
    el.style.left = '8px'
    el.style.bottom = '8px'
    el.style.zIndex = '999999'
    el.style.padding = '6px 8px'
    el.style.borderRadius = '10px'
    el.style.background = 'rgba(0,0,0,0.65)'
    el.style.border = '1px solid rgba(255,255,255,0.18)'
    el.style.color = '#fff'
    el.style.fontSize = '11px'
    el.style.fontFamily =
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    el.style.pointerEvents = 'none'
    el.textContent = `HOT patch: ${PATCH_VERSION}`
    document.body.appendChild(el)

    setInterval(() => {
      try {
        const last = window.__CC_LAST_HERE__
        if (last?.mapped) {
          el.textContent = `HOT patch: ${PATCH_VERSION} | opened: ${String(last.mapped).slice(0, 38)}…`
        } else {
          el.textContent = `HOT patch: ${PATCH_VERSION}`
        }
      } catch {
        // ignore
      }
    }, 500)
  } catch {
    // ignore
  }
}
mountPatchBadge()

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