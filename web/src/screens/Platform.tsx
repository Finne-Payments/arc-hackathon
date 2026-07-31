import type { FinneActions, ViewModel } from "../useFinne";
import type { ApiData } from "../useApi";
import { Eyebrow, SecondaryButton, StatusPill } from "../components/primitives";
import { platformStats, PAYMENT_WORD, PAYMENT_DOT, platformName } from "../mappers";

const COLS = "1.2fr 1fr .8fr 1.5fr 1.1fr .6fr";

/** Live marketplace rows from the API, falling back to the seeded constants. */
function usePlatformRows(apiData?: ApiData) {
  if (apiData && apiData.payouts.length > 0) {
    const rows = apiData.payouts.map((p) => ({
      merchant: platformName(p.platformKey),
      customer: p.recipientWallet,
      amount: `${p.amount} USDC`,
      purpose: p.workOrderRef ? p.workOrderRef.split(":").slice(1).join(":") : "—",
      status: { label: PAYMENT_WORD[p.status] ?? p.status, dot: PAYMENT_DOT[p.status] ?? "brand" },
      highlight: p.status === "DISPUTED",
    }));
    return { rows, stats: platformStats(apiData.payouts as never) };
  }
  return { rows: [], stats: null };
}

export function Platform({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  const { rows, stats } = usePlatformRows(apiData);
  return (
    <div className="rise-in">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Transactions</h1>
        <span style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", borderRadius: "var(--radius-pill)", padding: "3px 12px", fontSize: 12, fontWeight: 500, color: "var(--color-fg-muted)" }}>
          View access · decisions stay with each merchant's arbiter
        </span>
        <span style={{ flex: 1 }} />
        <SecondaryButton onClick={() => actions.doExport()} style={{ fontSize: 13, padding: "9px 15px" }}>
          Export for audit
        </SecondaryButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          marginBottom: 20,
          overflow: "hidden",
        }}
      >
        {[
          { label: "Volume · 30 days", value: stats?.volume ?? "4,820 USDC", sub: "Across 4 merchants", color: undefined },
          { label: "Protected in escrow", value: stats?.escrowTotal ?? "430 USDC", sub: stats?.escrowCount ?? "3 payments", color: undefined },
          { label: "Open disputes", value: String(stats?.openDisputes ?? 1), sub: `Oldest reply due in ${v.countdown}`, color: "var(--warn-600)" },
          { label: "Refund rate", value: stats?.refundRate ?? "2.1%", sub: "Trailing 90 days", color: undefined },
        ].map((s, i) => (
          <div key={i} style={{ padding: "16px 20px", borderLeft: i === 0 ? "none" : "1px solid var(--color-border)" }}>
            <Eyebrow color={s.color} style={{ marginBottom: 10 }}>
              {s.label}
            </Eyebrow>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 12,
            padding: "12px 20px",
            borderBottom: "1px solid var(--color-border)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: "var(--color-fg-subtle)",
          }}
        >
          <span>Merchant</span>
          <span>Customer</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span>For</span>
          <span>Status</span>
          <span />
        </div>
        {rows.map((row, i) => (
          <div
            key={i}
            className="row-hover"
            style={{
              display: "grid",
              gridTemplateColumns: COLS,
              gap: 12,
              padding: "11px 20px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--color-border)" : "none",
              fontSize: 13.5,
              alignItems: "center",
              background: row.highlight ? "var(--warn-soft)" : "transparent",
            }}
          >
            <span style={{ fontWeight: 600 }}>{row.merchant}</span>
            <span>{row.customer}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{row.amount}</span>
            <span>{row.purpose}</span>
            <StatusPill label={row.status.label} dot={row.status.dot} />
            <a onClick={() => actions.go("receipt")} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Receipt
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
