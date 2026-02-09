import { Buffer as _Buffer } from "buffer";
import _process from "process";

if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = _Buffer;
if (typeof globalThis.process === "undefined") globalThis.process = _process;
if (typeof window !== "undefined") {
  if (!window.Buffer) window.Buffer = _Buffer;
  if (!window.process) window.process = _process;
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);