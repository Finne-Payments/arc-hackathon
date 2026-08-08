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
import type { Role, Screen } from "./types";
import type { ViewModel } from "./useFinne";
import { isAllowed, homeScreenForRole } from "./domain/access";

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
  const navigate = useNavigate();

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
          // Always land the freshly-signed-in user on THEIR home screen — never
          // inherit the previous user's URL. This is the route guard for login.
          const home = SCREEN_PATH[homeScreenForRole(role)];
          navigate(home, { replace: true });
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
        // Reset to the login route so the next user starts clean (no stale URL).
        navigate("/", { replace: true });
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

  // URL ↔ screen sync WITH role-based route guards.
  // - On mount: only honor a deep link if its screen is ALLOWED for this role.
  //   Otherwise land on the role's home. This closes the "previous user's route
  //   shows for the new user" bug.
  // - Thereafter: keep the URL in step with the active screen + entity.
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      const parsed = parsePath(location.pathname);
      if (parsed.screen && isAllowed(frontendRole, parsed.screen)) {
        // Allowed deep link — carry the entity ID into useFinne state.
        if (parsed.caseId) actions.viewCase(parsed.caseId);
        else if (parsed.paymentId) actions.viewReceipt(parsed.paymentId);
        else actions.go(parsed.screen as never);
      } else {
        // Disallowed or bare URL → the role's home screen.
        actions.go(homeScreenForRole(frontendRole));
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
  // new role's home screen. Uses a ref to skip the initial mount — the init
  // effect above already handles the first load (deep link or home).
  const prevRole = useRef(frontendRole);
  useEffect(() => {
    if (prevRole.current === frontendRole) return; // skip initial mount
    prevRole.current = frontendRole;
    const home = homeScreenForRole(frontendRole);
    const homePath = SCREEN_PATH[home];
    actions.go(home);
    if (homePath && location.pathname !== homePath) {
      navigate(homePath, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontendRole]);

  // On screen change: reload the list data (payouts, cases, notifications) and
  // load the detail for the active entity. No interval polling — this only
  // fires when the user actually navigates.
  useEffect(() => {
    void apiActions.refresh();
    if (v.screen === "case") {
      const caseNumber = v.selectedCaseId ?? activeCaseNumber(apiData.cases);
      apiActions.loadCase(caseNumber);
    } else if (v.screen === "receipt" || v.screen === "final") {
      const paymentId = v.selectedPaymentId ?? activePaymentId(apiData.payouts);
      if (paymentId) apiActions.loadReceipt(paymentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.screen]);

  // Reload the active case when caseVersion bumps (after evidence/reply/request
  // is submitted) so all seats — including the arbiter — see the new data.
  useEffect(() => {
    if (v.screen === "case" && v.caseVersion > 0) {
      const caseNumber = v.selectedCaseId ?? activeCaseNumber(apiData.cases);
      apiActions.loadCase(caseNumber);
      void apiActions.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.caseVersion]);

  // Bridge the indexer's ~30s poll gap after a new payout is created on chain.
  // The payout row only exists once the indexer detects the on-chain
  // PaymentCreated event, which lags the wallet confirmation by up to 30s. The
  // normal screen-change refresh is one-shot and loses that race, so the ledger
  // (and receipt) showed stale data until a manual reload. This re-fetches on a
  // bounded escalating schedule — never a continuous poll (that was deliberately
  // removed for Arc RPC rate-limit reasons; see useApi.ts header).
  useEffect(() => {
    if (v.payoutVersion <= 0) return;
    let cancelled = false;
    // Immediate + escalating retries: covers the common fast-detect case and the
    // worst-case 30s indexer tick without spinning on the RPC.
    const timers = [0, 2500, 6000, 12000, 22000].map((ms) =>
      setTimeout(() => {
        if (cancelled) return;
        void apiActions.refresh();
        // If we landed on the receipt for the just-created payout, its row may
        // not have existed when the screen loaded (404 → empty spinner). Re-load
        // the receipt on each retry so it fills in once the indexer writes it.
        if (v.screen === "receipt" && v.selectedPaymentId) {
          apiActions.loadReceipt(v.selectedPaymentId);
        }
      }, ms),
    );
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.payoutVersion]);

  // Sync caseStage + reqLog from the live case data so the UI reflects the
  // real server state (e.g. case moved to AWAITING_RESPONSE after info request).
  useEffect(() => {
    if (!apiData.activeCase?.case) return;
    const c = apiData.activeCase.case as { status?: string; infoRequests?: { target: string; text: string }[] };
    const status = c.status ?? "UNDER_REVIEW";
    const newStage = status === "AWAITING_RESPONSE" ? "awaiting_response"
      : status === "UNDER_REVIEW" ? "under_review"
      : status === "CLOSED" || status === "EXECUTED" ? "decided"
      : "under_review";
    if (newStage !== v.stage) {
      actions.setCaseStage(newStage);
    }
  }, [apiData.activeCase]);

  // Render-time route guard: if the active screen isn't allowed for this role
  // (e.g. a customer somehow on "decision"), render the home screen instead.
  // Belt-and-suspenders with the init + role-change effects above.
  const safeScreen: Screen = isAllowed(frontendRole, v.screen)
    ? (v.screen as Screen)
    : homeScreenForRole(frontendRole);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "stretch" }}>
      <Sidebar role={v.role} screen={safeScreen} actions={actions} user={user} onLogout={onLogout} />

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
          {safeScreen === "ledger" && <Ledger v={v} actions={actions} apiData={apiData} />}
          {safeScreen === "newpayout" && <NewPayout actions={actions} apiData={apiData} />}
          {(safeScreen === "receipt" || safeScreen === "final") && <Receipt v={v} actions={actions} apiData={apiData} />}
          {safeScreen === "case" && <CaseRoom v={v} actions={actions} apiData={apiData} />}
          {safeScreen === "decision" && <Decision v={v} actions={actions} apiData={apiData} />}
          {safeScreen === "disputes" && <Disputes v={v} actions={actions} apiData={apiData} />}
          {safeScreen === "platform" && <Platform v={v} actions={actions} apiData={apiData} />}
          {safeScreen === "home" && <RecipientHome v={v} actions={actions} apiData={apiData} />}
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
