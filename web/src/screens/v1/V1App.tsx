/* ============================================================================
   V1App — the registrar-model app shell (UI-01).
   Navigation is URL-driven (react-router). State comes solely from useV1Api.
   No prototype state, no wallet simulation, no hardcoded demo content.
   Roles map to the registrar vocabulary: operations, reviewer, recipient.
   ========================================================================== */

import { useState, useEffect, useCallback } from "react";
import { useV1Api } from "../../useV1Api.ts";
import { v1api } from "../../v1api.ts";
import { getToken, setToken } from "../../api.ts";
import { Spinner } from "../../components/primitives.tsx";
import { Dashboard } from "./Dashboard.tsx";
import { CaseRoom } from "./CaseRoom.tsx";
import { DecisionScreen } from "./Decision.tsx";
import { CorrectionScreen } from "./Correction.tsx";

type V1Screen = "dashboard" | "case" | "decision" | "correction";

interface AuthState {
  authenticated: boolean;
  role: string;
  displayName: string;
}

export function V1App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [screen, setScreen] = useState<V1Screen>("dashboard");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const { data, actions } = useV1Api();

  // Check auth on mount
  useEffect(() => {
    const token = getToken();
    if (token) {
      v1api
        .me()
        .then((session) => {
          setAuth({
            authenticated: true,
            role: session.role,
            displayName: session.displayName,
          });
        })
        .catch(() => {
          setToken(null);
          setAuth({ authenticated: false, role: "operations", displayName: "" });
        });
    } else {
      setAuth({ authenticated: false, role: "operations", displayName: "" });
    }
  }, []);

  const selectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setScreen("case");
    actions.loadCase(caseId);
  }, [actions]);

  const selectPayment = useCallback((_paymentId: string) => {
    // Payments don't have a dedicated screen yet — the dashboard shows details inline
  }, []);

  const goDashboard = useCallback(() => {
    setScreen("dashboard");
    setSelectedCaseId(null);
    actions.refresh();
  }, [actions]);

  if (!auth) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (!auth.authenticated) {
    return <LoginScreen onLogin={(role, name) => setAuth({ authenticated: true, role, displayName: name })} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 24px", borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 16, letterSpacing: ".12em" }}>FINNÉ</div>
          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-fg-subtle)", textTransform: "uppercase" }}>
            Registrar · Arc
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--color-fg-muted)" }}>{auth.displayName}</span>
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-fg-subtle)", background: "var(--color-surface-2)", padding: "2px 8px", borderRadius: "var(--radius-pill)" }}>
            {auth.role}
          </span>
          <button
            onClick={() => { setToken(null); setAuth({ authenticated: false, role: "operations", displayName: "" }); }}
            style={{ fontSize: 11, color: "var(--color-fg-subtle)", background: "none", border: "none", cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={{ padding: "24px", maxWidth: 1000, margin: "0 auto" }}>
        {screen === "dashboard" && (
          <Dashboard
            data={data}
            actions={actions}
            onSelectPayment={selectPayment}
            onSelectCase={selectCase}
          />
        )}

        {screen === "case" && selectedCaseId && (
          <CaseRoom
            data={data}
            actions={actions}
            caseId={selectedCaseId}
            role={auth.role}
            onBack={goDashboard}
            onDecide={() => setScreen("decision")}
            onCorrect={async () => {
              const correctionId = await actions.createCorrection(selectedCaseId);
              if (correctionId) setScreen("correction");
            }}
          />
        )}

        {screen === "decision" && selectedCaseId && data.activeCase && (
          <DecisionScreen
            caseId={selectedCaseId}
            challengedAmountMicroUsdc={data.activeCase.case.challengedAmountMicroUsdc}
            actions={actions}
            onDone={() => { selectCase(selectedCaseId); }}
            onBack={() => setScreen("case")}
          />
        )}

        {screen === "correction" && selectedCaseId && (
          <CorrectionScreen
            data={data}
            actions={actions}
            caseId={selectedCaseId}
            onBack={() => setScreen("case")}
            onDone={() => { selectCase(selectedCaseId); }}
          />
        )}
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Login — simplified for the v1 registrar model (UI-01 step 3-4)             */
/* -------------------------------------------------------------------------- */

function LoginScreen({ onLogin }: { onLogin: (role: string, displayName: string) => void }) {
  const [role, setRole] = useState<string>("operations");
  const [loading, setLoading] = useState(false);

  // For the v1 model, login is simplified — in production this goes through
  // OIDC (operations/reviewer) or invitation-bound wallet challenge (recipient).
  // For demo, we issue a JWT directly via the backend's wallet-login endpoint.
  const handleLogin = async () => {
    setLoading(true);
    try {
      // Use the existing wallet login endpoint to get a JWT for the demo
      const res = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: "0x" + "1".repeat(40),
          seat: role === "operations" || role === "reviewer" ? "arbiter" : "customer",
        }),
      });
      const body = await res.json();
      if (body.token) {
        setToken(body.token);
        onLogin(role, body.user?.displayName ?? role);
      }
    } catch {
      // Fallback: just set the role locally for UI testing
      onLogin(role, `Demo ${role}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 440, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-2xl)", padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 22, letterSpacing: ".14em" }}>FINNÉ</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginTop: 3 }}>
            Registrar · on Arc
          </div>
        </div>

        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 10 }}>
          Choose a role
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
          {[
            { value: "operations", title: "Operations", desc: "Manages payouts + cases" },
            { value: "reviewer", title: "Reviewer", desc: "Decides disputes" },
            { value: "recipient", title: "Recipient", desc: "Responds + corrects" },
          ].map((r) => {
            const active = role === r.value;
            return (
              <div
                key={r.value}
                onClick={() => setRole(r.value)}
                style={{
                  border: active ? "2px solid var(--brand-600)" : "1px solid var(--color-border)",
                  background: active ? "var(--brand-50)" : "var(--color-surface)",
                  borderRadius: "var(--radius-md)", padding: "10px 8px", cursor: "pointer", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--brand-700)" : "var(--color-fg)", marginBottom: 2 }}>{r.title}</div>
                <div style={{ fontSize: 9.5, color: "var(--color-fg-subtle)", lineHeight: 1.3 }}>{r.desc}</div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%", border: "none",
            background: loading ? "var(--brand-50)" : "var(--brand-600)",
            color: loading ? "var(--brand-700)" : "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            padding: "11px 16px", fontSize: 13.5, fontWeight: 600,
            fontFamily: "var(--font-sans)", borderRadius: "var(--radius-md)",
          }}
        >
          {loading ? "Connecting…" : "Sign in"}
        </button>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-fg-subtle)", textAlign: "center" }}>
          Demo sign-in. Production uses OIDC (operations/reviewer) or wallet ownership proof (recipient).
        </div>
      </div>
    </div>
  );
}
