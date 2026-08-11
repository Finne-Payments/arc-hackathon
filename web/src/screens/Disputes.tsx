import { useMemo, useState } from "react";
import type { ViewModel, FinneActions } from "../useFinne";
import type { ApiData } from "../useApi";
import type { CaseRow, PayoutRow } from "../api";
import { StatusPill } from "../components/primitives";
import { claimLabel, CLAIM_CODES, CLAIM_LABEL } from "../domain/statusVocabulary";
import { platformName } from "../mappers";

/* ============================================================================
   Disputes — the list of cases, visually distinct from the case room.
   Each row shows the readable case code (+ CASE-NNNN mono), parties, the
   contested amount, a claim-type tag, a one-line claim summary, the status,
   and the reply window. A filter bar narrows by claim type, status, and text.
   ========================================================================== */

function subtitle(role: string): string {
  if (role === "arbiter")
    return "Cases waiting on your decision. The receipt for each payment is linked inside the case as evidence.";
  if (role === "customer") return "Disputes you opened on payments you made.";
  if (role === "merchant") return "Cases that concern payments made to you.";
  return "All cases across the marketplace · view access.";
}

type StatusFilter = "open" | "closed" | "all";

const CLAIM_PILL_COLOR: Record<string, string> = {
  [CLAIM_LABEL.work_not_delivered_in_full]: "var(--warn-soft)",
  [CLAIM_LABEL.short_payment]: "var(--brand-50)",
  [CLAIM_LABEL.unauthorised_charge]: "var(--risk-soft, var(--warn-soft))",
  [CLAIM_LABEL.deliverable_rejected]: "var(--brand-50)",
  [CLAIM_LABEL.other]: "var(--ink-50)",
};

export function Disputes({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  const [claimFilter, setClaimFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const allCases = apiData?.cases ?? [];
  const payouts = apiData?.payouts ?? [];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCases
      .filter((c) => {
        if (statusFilter === "open" && c.status === "CLOSED") return false;
        if (statusFilter === "closed" && c.status !== "CLOSED") return false;
        if (claimFilter !== "all" && c.allegationClaimType !== claimFilter) return false;
        if (!q) return true;
        const payout = payouts.find((p) => p.paymentId === c.payoutRef);
        const hay = [
          c.caseCode ?? "",
          c.caseNumber,
          c.allegationFreeText,
          c.allegationClaimType,
          claimLabel(c.allegationClaimType),
          payout ? `${platformName(payout.platformKey)} ${payout.recipientKey}` : "",
        ].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  }, [allCases, payouts, claimFilter, statusFilter, query]);

  return (
    <div className="rise-in">
      <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>
        Disputes
      </h1>
      <div style={{ fontSize: 14, color: "var(--color-fg-muted)", marginBottom: 20 }}>{subtitle(v.role)}</div>

      {/* filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search case code, parties, claim…"
          style={{
            flex: 1, minWidth: 200, maxWidth: 360,
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
            padding: "8px 12px", fontSize: 13, fontFamily: "var(--font-sans)",
            background: "var(--color-surface)", color: "var(--color-fg)",
          }}
        />
        <select value={claimFilter} onChange={(e) => setClaimFilter(e.target.value)} style={selectStyle}>
          <option value="all">All claim types</option>
          {CLAIM_CODES.map((code) => (
            <option key={code} value={code}>{CLAIM_LABEL[code]}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={selectStyle}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--color-fg-subtle)", marginLeft: "auto" }}>
          {rows.length} case{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* list */}
      {rows.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-fg-subtle)", fontSize: 14, border: "1px dashed var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}>
          {allCases.length === 0 ? "No cases yet. A dispute opens the first time someone contests a payout." : "No cases match these filters."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((c) => (
            <DisputeRow key={c.caseNumber} c={c} payout={payouts.find((p) => p.paymentId === c.payoutRef)} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  background: "var(--color-surface)",
  color: "var(--color-fg)",
  cursor: "pointer",
};

function DisputeRow({
  c,
  payout,
  actions,
}: {
  c: CaseRow;
  payout: PayoutRow | undefined;
  actions: FinneActions;
}) {
  const merchant = payout ? platformName(payout.platformKey) : "—";
  const customer = payout?.recipientKey ?? "—";
  const contested = c.allegationAmountContested || "0";
  const label = claimLabel(c.allegationClaimType);
  const pillBg = CLAIM_PILL_COLOR[label] ?? "var(--ink-50)";
  const isOpen = c.status !== "CLOSED" && c.status !== "EXECUTED";
  const summary = (c.allegationFreeText || "No claim text.").trim();

  return (
    <div
      onClick={() => actions.viewCase(c.caseNumber)}
      className="row-hover"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-surface)",
        padding: "16px 20px",
        cursor: "pointer",
        boxShadow: "var(--shadow-xs)",
      }}
    >
      {/* top line: codes + amount */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15, color: "var(--color-fg)" }}>
          {c.caseCode || c.caseNumber}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-fg-subtle)" }}>{c.caseNumber}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--color-fg)" }}>{contested} USDC</span>
        <span style={{ fontSize: 11, color: "var(--color-fg-subtle)" }}>contested</span>
      </div>

      {/* middle: parties + claim tag + summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>
          <strong style={{ color: "var(--color-fg)" }}>{merchant}</strong> ↔ {customer}
        </span>
        <span style={{ background: pillBg, border: "1px solid var(--color-border)", borderRadius: "var(--radius-pill)", padding: "2px 10px", fontSize: 11.5, fontWeight: 600, color: "var(--color-fg)" }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-fg-subtle)", textTransform: "capitalize" }}>
          opened by {c.openedBy}
        </span>
      </div>

      {/* claim summary */}
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.5, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        “{summary}”
      </div>

      {/* bottom: status + deadline + open link */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <StatusPill
          label={
            c.status === "CLOSED" || c.status === "EXECUTED"
              ? "Refunded"
              : c.infoRequestCount > 0
                ? "More information requested"
                : "Under review"
          }
          dot={
            c.status === "CLOSED" || c.status === "EXECUTED"
              ? "risk"
              : c.infoRequestCount > 0
                ? "brand"
                : "warn"
          }
        />
        <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>
          {isOpen ? `Reply due ${formatDeadline(c.responseDeadline)}` : `Closed ${formatDeadline(c.openedAt)}`}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--brand-600)" }}>Open case →</span>
      </div>
    </div>
  );
}

function formatDeadline(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
  } catch {
    return iso;
  }
}
