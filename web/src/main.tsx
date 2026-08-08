import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/tokens.css";
import "./styles/global.css";

// Single product — the escrow App at "/". The v1 registrar surface was
// consolidated into this app (agent decision frame, governing-law library,
// structured case context, per-line accept/edit/discard) and the separate
// /v1-app entry point + v1 route tree were removed. See ADR 0007 + the
// consolidation PRs for the migration history.

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
