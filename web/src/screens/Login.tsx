import { useState } from "react";
import { api, setToken, type PublicUser } from "../api";

/* ============================================================================
   Login screen — role-select cards + password authentication.
   All 4 roles visible at once. Click a card → credentials pre-fill → Sign in.
   ========================================================================== */

type RoleKey = "arbiter" | "merchant" | "customer" | "platform";

const DEMO_ACCOUNTS: Record<RoleKey, { email: string; password: string; name: string; title: string; desc: string; color: string }> = {
  arbiter: {
    email: "dana@northbeam.com",
    password: "password123",
    name: "Dana Whitfield",
    title: "Arbiter",
    desc: "Decides refunds, signs on-chain",
    color: "var(--brand-500)",
  },
  merchant: {
    email: "dana@northbeam.com",
    password: "password123",
    name: "Northbeam",
    title: "Merchant",
    desc: "Creates payouts, opens disputes",
    color: "var(--warn-500)",
  },
  customer: {
    email: "maya@recipient.com",
    password: "password123",
    name: "Maya Reyes",
    title: "Customer",
    desc: "Receives payouts, withdraws",
    color: "var(--ok-500)",
  },
  platform: {
    email: "viewer@parkline.com",
    password: "password123",
    name: "Parkline",
    title: "Platform",
    desc: "Read-only marketplace view",
    color: "var(--brand-400)",
  },
};

export function Login({ onLogin }: { onLogin: (user: PublicUser, frontendRole?: string) => void }) {
  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectRole = (role: RoleKey) => {
    const acct = DEMO_ACCOUNTS[role];
    setSelectedRole(role);
    setEmail(acct.email);
    setPassword(acct.password);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await api.login(email, password);
      setToken(result.token);
      onLogin(result.user, selectedRole ?? undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Authentication failed.";
      if (msg.includes("Invalid email or password")) {
        setError("Login failed — demo users may not be seeded yet. Run `npm run seed` in the backend first.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-lg)", padding: 28 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 22, letterSpacing: ".14em", color: "var(--color-fg)" }}>FINNÉ</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginTop: 3 }}>
            Dispute system · on Arc
          </div>
        </div>

        {/* Role-select cards — single row of 4 compact cards */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 10 }}>
            Choose a role to sign in
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {(Object.keys(DEMO_ACCOUNTS) as RoleKey[]).map((key) => {
              const acct = DEMO_ACCOUNTS[key];
              const active = selectedRole === key;
              return (
                <div
                  key={key}
                  onClick={() => selectRole(key)}
                  style={{
                    border: active ? "2px solid var(--brand-600)" : "1px solid var(--color-border)",
                    background: active ? "var(--brand-50)" : "var(--color-surface)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 8px",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all .15s ease",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: acct.color, display: "block", margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--brand-700)" : "var(--color-fg)", marginBottom: 2 }}>{acct.title}</div>
                  <div style={{ fontSize: 10, color: "var(--color-fg-muted)", marginBottom: 3 }}>{acct.name}</div>
                  <div style={{ fontSize: 9.5, color: "var(--color-fg-subtle)", lineHeight: 1.3 }}>{acct.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--color-border)", marginBottom: 16 }} />

        {/* Error */}
        {error && (
          <div style={{ background: "var(--risk-soft)", border: "1px solid var(--risk-border)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 12, color: "var(--risk-600)", marginBottom: 12, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {/* Login form — compact inline */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-fg-muted)", marginBottom: 3, display: "block" }}>Email</label>
            <input
              className="finne-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && submit()}
              style={{ width: "100%", fontSize: 13, padding: "8px 10px" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-fg-muted)", marginBottom: 3, display: "block" }}>Password</label>
            <input
              className="finne-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email && submit()}
              style={{ width: "100%", fontSize: 13, padding: "8px 10px" }}
            />
          </div>
          <button
            onClick={submit}
            disabled={loading || !email || !password}
            style={{
              border: "none",
              cursor: loading || !email || !password ? "not-allowed" : "pointer",
              background: loading || !email || !password ? "var(--ink-100)" : "var(--brand-600)",
              color: loading || !email || !password ? "var(--color-fg-subtle)" : "#fff",
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: 13,
              padding: "9px 18px",
              borderRadius: "var(--radius-md)",
              boxShadow: loading || !email || !password ? "none" : "var(--shadow-sm)",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "…" : "Sign in"}
          </button>
        </div>

        {/* Wallet note */}
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--color-fg-subtle)", textAlign: "center", lineHeight: 1.4 }}>
          Password signs you in. Wallet connected separately for blockchain actions.
        </div>

        {/* Demo credentials — compact single line */}
        <div style={{ marginTop: 14, padding: "8px 12px", background: "var(--ink-50)", borderRadius: "var(--radius-sm)", fontSize: 10.5, color: "var(--color-fg-subtle)", lineHeight: 1.6, textAlign: "center" }}>
          <strong style={{ color: "var(--color-fg-muted)" }}>Demo:</strong> dana@northbeam.com · maya@recipient.com · viewer@parkline.com — password <strong>password123</strong>
        </div>
      </div>
    </div>
  );
}
