import { Buffer } from "buffer";
import process from "process";

globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.process = globalThis.process || process;

if (typeof window !== "undefined") {
  window.Buffer = window.Buffer || Buffer;
  window.process = window.process || process;
  window.global = window.global || globalThis;
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