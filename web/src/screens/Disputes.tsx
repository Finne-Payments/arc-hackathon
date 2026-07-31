import type { ViewModel, FinneActions } from "../useFinne";
import type { ApiData } from "../useApi";
import { StatusPill } from "../components/primitives";
import { caseToListView } from "../mappers";

const COLS = ".9fr 1.5fr .8fr 1.2fr 1.1fr";

function subtitle(role: string): string {
  if (role === "arbiter")
    return "Cases waiting on your decision. The receipt for each payment is linked inside the case as evidence.";
  if (role === "merchant") return "Cases you opened or that concern your payouts.";
  if (role === "customer") return "Cases that concern payments made to you.";
  return "All cases across Parkline merchants · view access.";
}

export function Disputes({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  return (
    <div className="rise-in">
      <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>
        Disputes
      </h1>
      <div style={{ fontSize: 14, color: "var(--color-fg-muted)", marginBottom: 24 }}>{subtitle(v.role)}</div>

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
          <span>Case</span>
          <span>Parties</span>
          <span style={{ textAlign: "right" }}>Contested</span>
          <span>Status</span>
          <span>Reply due</span>
        </div>

        {/* live case row — uses API data when available, stage-derived chip otherwise */}
        {(() => {
          const live = apiData && apiData.cases.length > 0 ? apiData.cases.find((c) => c.status !== "CLOSED") ?? null : null;
          const payout = live ? apiData!.payouts.find((p) => p.paymentId === live.payoutRef) : undefined;
          const view = live ? caseToListView(live, payout) : null;
          const caseId = view?.caseId ?? "CASE-0142";
          const parties = view?.parties ?? "Northbeam Studios ↔ Maya Reyes";
          const contested = view?.contested ?? "33 USDC";
          const dot = v.caseChipColor.includes("risk") ? "risk" as const : v.caseChipColor.includes("brand") ? "brand" as const : "warn" as const;
          return (
            <div
              onClick={() => actions.go("case")}
              className="row-hover"
              style={{
                display: "grid",
                gridTemplateColumns: COLS,
                gap: 12,
                padding: "13px 20px",
                borderBottom: "1px solid var(--color-border)",
                fontSize: 13.5,
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>{caseId}</span>
              <span>{parties}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{contested}</span>
              <StatusPill label={v.caseChipLabel} dot={dot} />
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>{v.disputeDeadlineCell}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--brand-600)", whiteSpace: "nowrap" }}>Open case →</span>
              </span>
            </div>
          );
        })()}

        {/* closed case row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 12,
            padding: "13px 20px",
            fontSize: 13.5,
            alignItems: "center",
            color: "var(--color-fg-muted)",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>CASE-0137</span>
          <span>Northbeam Studios ↔ Alex Chen</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>60 USDC</span>
          <StatusPill label="Refunded" dot="risk" style={{ color: "var(--color-fg)" }} />
          <span style={{ fontSize: 13, color: "var(--color-fg-subtle)" }}>Closed 12 Jul</span>
        </div>
      </div>
    </div>
  );
}
