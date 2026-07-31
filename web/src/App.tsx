import { useEffect, useState } from "react";
import { useFinne } from "./useFinne";
import { useApi } from "./useApi";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { DemoControls, StatusStrip, Toasts } from "./components/Overlays";
import { Ledger } from "./screens/Ledger";
import { Disputes } from "./screens/Disputes";
import { Platform } from "./screens/Platform";
import { NewPayout } from "./screens/NewPayout";
import { Receipt } from "./screens/Receipt";
import { CaseRoom } from "./screens/CaseRoom";
import { Decision } from "./screens/Decision";
import { RecipientHome } from "./screens/RecipientHome";
import { Login } from "./screens/Login";
import { roleBadge } from "./mappers";
import { api, getToken, setToken, type PublicUser } from "./api";
import type { Role } from "./types";
import type { ViewModel } from "./useFinne";

/** Map the backend user role to the frontend's Role union. */
function userRoleToFrontend(role: string): Role {
  switch (role) {
    case "reviewer":
      return "arbiter";
    case "recipient":
      return "customer";
    case "platform_viewer":
      return "platform";
    default:
      return "arbiter";
  }
}

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Boot: if a token exists in localStorage, restore the session.
  useEffect(() => {
    const token = getToken();
    if (token) {
      api.getMe()
        .then((res) => setUser(res.user))
        .catch(() => setToken(null))
        .finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  if (!authChecked) {
    return <div style={{ minHeight: "100vh", background: "var(--color-bg)" }} />;
  }

  // Not logged in → show the login screen.
  if (!user) {
    return <Login onLogin={(u) => setUser(u)} />;
  }

  return <AuthenticatedApp user={user} onLogout={() => { setToken(null); setUser(null); }} />;
}

function AuthenticatedApp({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const frontendRole = userRoleToFrontend(user.role);
  const finne = useFinne(frontendRole);
  const { v, actions, state } = finne;
  const [controlsOpen, setControlsOpen] = useState(false);

  const { data: apiData, actions: apiActions } = useApi(frontendRole);

  useEffect(() => {
    apiActions.setRole(frontendRole);
  }, [frontendRole, apiActions]);

  useEffect(() => {
    if (v.screen === "case") {
      const caseNumber = activeCaseNumber(apiData.cases);
      apiActions.loadCase(caseNumber);
    } else if (v.screen === "receipt" || v.screen === "final") {
      const paymentId = activePaymentId(apiData.payouts);
      apiActions.loadReceipt(paymentId);
    }
  }, [v.screen, apiData.cases, apiData.payouts, apiActions]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "stretch" }}>
      <Sidebar role={v.role} screen={v.screen} actions={actions} user={user} onLogout={onLogout} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar roleBadge={`${user.displayName} · ${user.email}`} roleDot={roleBadge(v.role).dot} />

        <div className="app-main" style={{ flex: 1, width: "100%", maxWidth: 1100, margin: 0, padding: "28px 32px 110px", boxSizing: "border-box" }}>
          {v.screen === "ledger" && <Ledger v={v} actions={actions} apiData={apiData} />}
          {v.screen === "newpayout" && <NewPayout actions={actions} apiData={apiData} />}
          {(v.screen === "receipt" || v.screen === "final") && <Receipt v={v} actions={actions} apiData={apiData} />}
          {v.screen === "case" && <CaseRoom v={v} actions={actions} apiData={apiData} />}
          {v.screen === "decision" && <Decision v={v} actions={actions} apiData={apiData} />}
          {v.screen === "disputes" && <Disputes v={v} actions={actions} apiData={apiData} />}
          {v.screen === "platform" && <Platform v={v} actions={actions} apiData={apiData} />}
          {v.screen === "home" && <RecipientHome v={v} actions={actions} apiData={apiData} />}
        </div>
      </div>

      {state.demoMode && !state.stripDismissed && <StatusStrip actions={actions} />}
      <DemoControls v={v} actions={actions} open={controlsOpen} onToggle={() => setControlsOpen((o) => !o)} />
      <Toasts exportToast={state.exportToast} copied={state.copied} />
    </div>
  );
}

function activeCaseNumber(cases: { caseNumber: string; status: string }[]): string | null {
  const open = cases.find((c) => c.status !== "CLOSED");
  return open?.caseNumber ?? cases[0]?.caseNumber ?? null;
}

function activePaymentId(payouts: { paymentId: string; status: string }[]): string | null {
  const disputed = payouts.find((p) => p.status === "DISPUTED");
  return disputed?.paymentId ?? payouts[0]?.paymentId ?? null;
}

export type { ViewModel };
