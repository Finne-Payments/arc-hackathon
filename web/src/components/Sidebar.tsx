import type { Role, Screen } from "../types";
import type { FinneActions } from "../useFinne";

interface NavDef {
  label: string;
  s: Screen;
  act: Screen[];
}

function navForRole(role: Role): NavDef[] {
  if (role === "arbiter")
    return [{ label: "Disputes", s: "disputes", act: ["disputes", "case", "decision", "receipt", "final"] }];
  if (role === "merchant")
    return [
      { label: "Payouts", s: "ledger", act: ["ledger", "receipt", "final"] },
      { label: "Disputes", s: "disputes", act: ["disputes", "case"] },
    ];
  if (role === "platform")
    return [
      { label: "Transactions", s: "platform", act: ["platform", "receipt", "final"] },
      { label: "Disputes", s: "disputes", act: ["disputes", "case"] },
    ];
  // customer
  return [
    { label: "Your payouts", s: "home", act: ["home", "receipt", "final"] },
    { label: "Disputes", s: "disputes", act: ["disputes", "case"] },
  ];
}

function roleBadge(role: Role): { label: string; session: string; dot: string } {
  switch (role) {
    case "arbiter":
      return {
        label: "Arbiter · Dana Whitfield · Northbeam Studios",
        session: "Northbeam Studios",
        dot: "var(--brand-500)",
      };
    case "merchant":
      return {
        label: "Merchant · Northbeam Studios",
        session: "Northbeam Studios",
        dot: "var(--warn-500)",
      };
    case "platform":
      return {
        label: "Platform · Parkline Market · view access",
        session: "Parkline Market",
        dot: "var(--brand-400)",
      };
    default:
      return { label: "Customer · Maya Reyes", session: "Maya Reyes", dot: "var(--ok-500)" };
  }
}

export function Sidebar({
  role,
  screen,
  actions,
  user,
  onLogout,
}: {
  role: Role;
  screen: Screen;
  actions: FinneActions;
  user?: { displayName: string; email: string; walletAddress: string | null } | null;
  onLogout?: () => void;
}) {
  const items = navForRole(role);
  const { session, label, dot } = roleBadge(role);

  return (
    <>
      {/* desktop sidebar */}
      <aside
        className="sidebar-desktop"
        style={{
          width: 224,
          flexShrink: 0,
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          padding: "20px 12px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 10px 20px" }}>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: ".12em",
              color: "var(--color-fg)",
            }}
          >
            FINNÉ
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--color-fg-subtle)",
            }}
          >
            on Arc
          </span>
        </div>

        <div className="e-label" style={{ padding: "0 10px 8px" }}>
          {session}
        </div>

        <nav style={{ display: "flex", flexDirection: "column" }}>
          {items.map((n) => {
            const active = n.act.includes(screen);
            return (
              <button
                key={n.label}
                onClick={() => actions.go(n.s)}
                className="sidebar-nav"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--brand-700)" : "var(--ink-600)",
                  background: active ? "var(--brand-50)" : "transparent",
                  marginBottom: 2,
                  border: "none",
                  textAlign: "left",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {n.label}
              </button>
            );
          })}
        </nav>

        <span style={{ flex: 1 }} />

        <div
          style={{
            border: "1px solid var(--warn-border)",
            background: "var(--warn-soft)",
            borderRadius: "var(--radius-md)",
            padding: "9px 11px",
            fontSize: 11,
            lineHeight: 1.5,
            color: "var(--color-fg-muted)",
            marginBottom: 12,
          }}
        >
          <strong style={{ color: "var(--color-fg)" }}>Arc testnet</strong> · demonstration environment
        </div>

        <div className="e-label" style={{ padding: "0 10px 6px" }}>
          Account
        </div>
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-fg)" }}>{user?.displayName ?? "User"}</div>
          <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginTop: 2 }}>{user?.email}</div>
          {user?.walletAddress ? (
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ok-600)", marginTop: 4 }}>
              Wallet: {user.walletAddress.slice(0, 6)}…{user.walletAddress.slice(-4)}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginTop: 4 }}>No wallet connected</div>
          )}
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              cursor: "pointer",
              padding: "7px 10px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-sans)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-fg-muted)",
            }}
          >
            Sign out
          </button>
        )}
      </aside>

      {/* mobile top brand + session switcher */}
      <div className="sidebar-mobile" style={{ display: "none", padding: "12px 16px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 16, letterSpacing: ".12em" }}>FINNÉ</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-fg-subtle)" }}>on Arc</span>
          <span style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--color-border)", borderRadius: "var(--radius-pill)", padding: "4px 12px", fontSize: 12, fontWeight: 500, color: "var(--color-fg-muted)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
            {label.split(" · ")[0]}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-fg)" }}>{user?.displayName ?? "User"}</span>
          <span style={{ flex: 1 }} />
          {onLogout && (
            <button onClick={onLogout} style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: "var(--radius-md)", color: "var(--color-fg-muted)" }}>
              Sign out
            </button>
          )}
        </div>
        <nav style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {items.map((n) => {
            const active = n.act.includes(screen);
            return (
              <button
                key={n.label}
                onClick={() => actions.go(n.s)}
                style={{
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--brand-700)" : "var(--ink-600)",
                  background: active ? "var(--brand-50)" : "var(--ink-50)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {n.label}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
