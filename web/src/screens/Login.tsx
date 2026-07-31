import { useState } from "react";
import { api, setToken, type PublicUser } from "../api";

/* ============================================================================
   Login screen — password-based authentication.
   Password = identity (off-chain). Wallet = money (on-chain), connected
   separately after login when a blockchain action is needed.
   ========================================================================== */

export function Login({ onLogin }: { onLogin: (user: PublicUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"reviewer" | "recipient" | "platform_viewer">("reviewer");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await api.login(email, password)
          : await api.register({ email, password, role, displayName: displayName || email, platformKey: "northbeam" });
      setToken(result.token);
      onLogin(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
      <div style={{ width: 380, maxWidth: "90vw", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 20, letterSpacing: ".12em", color: "var(--color-fg)" }}>FINNÉ</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginLeft: 8 }}>on Arc</span>
        </div>

        <h2 style={{ margin: "0 0 20px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 20, textAlign: "center" }}>
          {mode === "login" ? "Sign in" : "Create account"}
        </h2>

        {error && (
          <div style={{ background: "var(--risk-soft)", border: "1px solid var(--risk-border)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 13, color: "var(--risk-600)", marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && (
            <>
              <input
                className="finne-input"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <select
                className="finne-input"
                value={role}
                onChange={(e) => setRole(e.target.value as "reviewer" | "recipient" | "platform_viewer")}
              >
                <option value="reviewer">Arbiter (reviewer)</option>
                <option value="recipient">Recipient</option>
                <option value="platform_viewer">Platform viewer (read-only)</option>
              </select>
            </>
          )}
          <input
            className="finne-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <input
            className="finne-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
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
              fontSize: 14,
              padding: "11px 20px",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--color-fg-muted)" }}>
          {mode === "login" ? "No account? " : "Already have an account? "}
          <a
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
            style={{ cursor: "pointer", fontWeight: 600 }}
          >
            {mode === "login" ? "Register" : "Sign in"}
          </a>
        </div>

        {mode === "login" && (
          <div style={{ marginTop: 20, padding: 12, background: "var(--ink-50)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--color-fg-subtle)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--color-fg-muted)" }}>Demo accounts</strong> (password: <code>password123</code>):
            <br />dana@northbeam.com · maya@recipient.com · viewer@parkline.com
          </div>
        )}
      </div>
    </div>
  );
}
