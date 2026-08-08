import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { V1App } from "./screens/v1/V1App";
import "./styles/tokens.css";
import "./styles/global.css";

// Two surfaces coexist during the migration to a single product:
//   - "/"        → the live escrow App (the demo surface): real on-chain
//                  pay()/refundByArbiter()/withdraw(), the debt path, wallet
//                  signing, the merchant/customer/platform/arbiter seats.
//                  This is the default and is what the demo runs on.
//   - "/v1-app"  → the registrar preview: agent decision frames, immutable
//                  records, voluntary corrections, the governing-law library.
//                  Intended to become the single product after the demo.
// Set VITE_V1_DEFAULT=true to serve the registrar at "/" as well (NOT set by
// default — flipping it removes the escrow demo beat; see ADR 0007).
const useV1 = window.location.pathname.startsWith("/v1-app") ||
  (import.meta as unknown as { env?: { VITE_V1_DEFAULT?: string } }).env?.VITE_V1_DEFAULT === "true";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      {useV1 ? <V1App /> : <App />}
    </BrowserRouter>
  </React.StrictMode>
);
