import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useFinne } from "./useFinne";
import { useApi } from "./useApi";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Toasts } from "./components/Overlays";
import { Ledger } from "./screens/Ledger";
import { Disputes } from "./screens/Disputes";
import { Platform } from "./screens/Platform";
import { NewPayout } from "./screens/NewPayout";
import { Receipt } from "./screens/Receipt";
import { CaseRoom } from "./screens/CaseRoom";
import { Decision } from "./screens/Decision";
import { RecipientHome } from "./screens/RecipientHome";
import { Login } from "./screens/Login";
import { roleBadge, roleLabel } from "./mappers";
import { api, getToken, setToken, type PublicUser } from "./api";
import type { Role } from "./types";
import type { ViewModel } from "./useFinne";

/** Map the backend user role to the frontend's Role union (fallback when no
    explicit frontend role was chosen at login). */
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

const FRONTEND_ROLE_KEY = "finne-frontend-role";

/** Valid frontend roles (must match the Role type in types.ts). */
const VALID_ROLES: Role[] = ["arbiter", "merchant", "customer", "platform"];

function isValidRole(r: string | null): r is Role {
  return !!r && VALID_ROLES.includes(r as Role);
}

/* ============================================================================
   URL ↔ screen sync (GAP-W5). useFinne remains the source of truth for the
   ViewModel; this keeps the browser URL in step so screens are deep-linkable
   and shareable. Entity screens carry their ID in the path so each dispute and
   receipt has its own URL (e.g. /case/CASE-0142, /receipt/pmt_123).
   ========================================================================== */
const SCREEN_PATH: Record<string, string> = {
  ledger: "/ledger",
  newpayout: "/new-payout",
  receipt: "/receipt",
  final: "/receipt",
  case: "/case",
  decision: "/decision",
  home: "/home",
  disputes: "/disputes",
  platform: "/platform",
};

/** Build the URL for a screen + the selected entity (if any). */
function screenUrl(screen: string, caseId: string | null, paymentId: string | null): string {
  const base = SCREEN_PATH[screen];
  if (!base) return "/";
  if (screen === "case" && caseId) return `${base}/${caseId}`;
  if ((screen === "receipt" || screen === "final") && paymentId) return `${base}/${paymentId}`;
  return base;
}

const PATH_SCREEN: Record<string, string> = Object.fromEntries(
  Object.entries(SCREEN_PATH).map(([s, p]) => [p, s]),
);

/**
 * Parse the browser path into { screen, caseId, paymentId } so a deep link to
 * /case/CASE-0142 or /receipt/pmt_123 opens the right entity. Falls back to the
 * bare screen when the path has no ID segment.
 */
function parsePath(pathname: string): { screen: string | null; caseId: string | null; paymentId: string | null } {
  const parts = pathname.split("/").filter(Boolean); // e.g. ["case", "CASE-0142"]
  // /receipt maps to both "receipt" and "final" (they share a path); deep links
  // always resolve to the canonical "receipt" view. "final" is an internal state
  // set only after a confirmed refund — never reachable via URL.
  const raw = parts[0] ? PATH_SCREEN["/" + parts[0]] ?? null : null;
  const screen = raw === "final" ? "receipt" : raw;
  const id = parts[1] ?? null;
  if (!screen) return { screen: null, caseId: null, paymentId: null };
  if (screen === "case") return { screen, caseId: id, paymentId: null };
  if (screen === "receipt") return { screen, caseId: null, paymentId: id };
  return { screen, caseId: null, paymentId: null };
}

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [frontendRole, setFrontendRole] = useState<Role | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Boot: if a token exists in localStorage, restore the session + chosen role.
  useEffect(() => {
    const token = getToken();
    if (token) {
      api.getMe()
        .then((res) => {
          setUser(res.user);
          // Restore the frontend role from localStorage (chosen at login), or
          // fall back to the seat the backend bound to this wallet, then to the
          // derived backend role.
          const saved = localStorage.getItem(FRONTEND_ROLE_KEY);
          if (isValidRole(saved)) {
            setFrontendRole(saved);
          } else if (isValidRole(res.user.seat)) {
            setFrontendRole(res.user.seat);
          } else {
            setFrontendRole(userRoleToFrontend(res.user.role));
          }
        })
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
  if (!user || !frontendRole) {
    return (
      <Login
        onLogin={(u, chosenRole) => {
          setUser(u);
          // Use the chosen frontend role if provided (e.g. "merchant"), else derive.
          const role = isValidRole(chosenRole ?? null)
            ? (chosenRole as Role)
            : userRoleToFrontend(u.role);
          setFrontendRole(role);
          localStorage.setItem(FRONTEND_ROLE_KEY, role);
        }}
      />
    );
  }

  return (
    <AuthenticatedApp
      user={user}
      frontendRole={frontendRole}
      onLogout={() => {
        setToken(null);
        setUser(null);
        setFrontendRole(null);
        localStorage.removeItem(FRONTEND_ROLE_KEY);
        window.history.replaceState({}, "", "/");
      }}
    />
  );
}

function AuthenticatedApp({ user, frontendRole, onLogout }: { user: PublicUser; frontendRole: Role; onLogout: () => void }) {
  const finne = useFinne(frontendRole);
  const { v, actions, state } = finne;
  const navigate = useNavigate();
  const location = useLocation();

  const { data: apiData, actions: apiActions } = useApi(frontendRole);

  useEffect(() => {
    apiActions.setRole(frontendRole);
  }, [frontendRole, apiActions]);

  // URL ↔ screen sync with role-based route guards.
  // - On mount: parse the deep link (e.g. /case/CASE-0142) and set the screen
  //   + selected entity so the right data loads. Bare screens (e.g. /disputes)
  //   just set the screen.
  // - Thereafter: keep the URL in step with the active screen + entity, so every
  //   dispute and receipt has its own shareable URL.
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      const parsed = parsePath(location.pathname);
      if (parsed.screen) {
        // Carry the entity ID from the URL into useFinne state so the data-load
        // effect fetches the right case/receipt.
        if (parsed.caseId) actions.viewCase(parsed.caseId);
        else if (parsed.paymentId) actions.viewReceipt(parsed.paymentId);
        else actions.go(parsed.screen as never);
      }
      return;
    }
    if (v.screen) {
      const path = screenUrl(v.screen, v.selectedCaseId, v.selectedPaymentId);
      if (path !== location.pathname) navigate(path, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.screen, v.selectedCaseId, v.selectedPaymentId, location.pathname]);

  // When the role changes (view-as dropdown or role switch), redirect to the
  // home screen for the new role.
  useEffect(() => {
    const homePath = SCREEN_PATH[
      frontendRole === "arbiter" ? "disputes"
      : frontendRole === "merchant" ? "ledger"
      : frontendRole === "customer" ? "home"
      : "platform"
    ];
    if (homePath && location.pathname !== homePath) {
      navigate(homePath, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontendRole]);

  useEffect(() => {
    if (v.screen === "case") {
      const caseNumber = v.selectedCaseId ?? activeCaseNumber(apiData.cases);
      apiActions.loadCase(caseNumber);
    } else if (v.screen === "receipt" || v.screen === "final") {
      // Use the specific payout the user clicked, not the first one in the list.
      const paymentId = v.selectedPaymentId ?? activePaymentId(apiData.payouts);
      if (paymentId) apiActions.loadReceipt(paymentId);
    }
  }, [v.screen, v.selectedPaymentId, v.selectedCaseId, apiData.cases, apiData.payouts, apiActions]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "stretch" }}>
      <Sidebar role={v.role} screen={v.screen} actions={actions} user={user} onLogout={onLogout} apiData={apiData} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar
          roleBadge={`${roleLabel(v.role)} · ${user.displayName}`}
          roleLabel={roleLabel(v.role)}
          roleDot={roleBadge(v.role).dot}
          user={user}
          onLogout={onLogout}
          apiData={apiData}
          actions={actions}
        />

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
