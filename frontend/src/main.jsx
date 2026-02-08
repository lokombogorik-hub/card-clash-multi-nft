// Polyfills
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;
import process from "process/browser";
globalThis.process = process;
if (!globalThis.process.env) globalThis.process.env = {};
globalThis.global = globalThis;

// ПЕРЕХВАТ openTelegramLink ДО загрузки любых модулей
(function () {
  function waitForTelegram() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openTelegramLink) {
      var original = window.Telegram.WebApp.openTelegramLink;
      window.Telegram.WebApp.openTelegramLink = function (url) {
        if (url && url.indexOf("herewalletbot") !== -1) {
          console.log("[EARLY INTERCEPT] blocked openTelegramLink:", url);
          // Dispatch event чтобы наш код его поймал
          window.dispatchEvent(new CustomEvent("hot-wallet-open", { detail: { url: url } }));
          return;
        }
        original.call(window.Telegram.WebApp, url);
      };
      console.log("[EARLY INTERCEPT] installed");
    } else {
      setTimeout(waitForTelegram, 50);
    }
  }
  waitForTelegram();

  // Слушаем event и открываем iframe
  window.addEventListener("hot-wallet-open", function (e) {
    var url = e.detail && e.detail.url;
    if (!url) return;

    var webUrl = "https://my.herewallet.app/";
    try {
      var search = new URL(url).search;
      webUrl = "https://my.herewallet.app/" + search;
    } catch (err) { }

    var old = document.getElementById("hot-iframe-overlay");
    if (old) old.remove();

    var overlay = document.createElement("div");
    overlay.id = "hot-iframe-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.95);" +
      "display:flex;flex-direction:column;";

    overlay.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;' +
      'padding:12px 16px;background:#111;flex-shrink:0;">' +
      '<span style="color:#fff;font-size:15px;font-weight:900;">🔥 HOT Wallet</span>' +
      '<button id="hot-close-btn" style="width:36px;height:36px;border-radius:10px;' +
      'border:1px solid rgba(255,255,255,0.2);background:rgba(255,60,60,0.3);' +
      'color:#fff;font-size:18px;font-weight:900;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;">✕</button></div>' +
      '<iframe src="' + webUrl + '" style="flex:1;width:100%;border:none;background:#000;" ' +
      'allow="clipboard-read;clipboard-write;web-share"></iframe>';

    document.body.appendChild(overlay);

    document.getElementById("hot-close-btn").addEventListener("click", function () {
      var el = document.getElementById("hot-iframe-overlay");
      if (el) el.remove();
    });

    console.log("[EARLY INTERCEPT] iframe opened:", webUrl);
  });
})();

// App
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);