import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { V1App } from "./screens/v1/V1App";
import "./styles/tokens.css";
import "./styles/global.css";

// The v1 registrar UI is served at /v1-app; the legacy UI remains at /.
// This lets both coexist during the migration. To default to v1, set
// REACT_APP_V1_DEFAULT=true in the environment.
const useV1 = window.location.pathname.startsWith("/v1-app") ||
  (import.meta as unknown as { env?: { VITE_V1_DEFAULT?: string } }).env?.VITE_V1_DEFAULT === "true";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      {useV1 ? <V1App /> : <App />}
    </BrowserRouter>
  </React.StrictMode>
);
