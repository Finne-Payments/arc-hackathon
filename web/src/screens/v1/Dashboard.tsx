/* ============================================================================
   Dashboard — operations/reviewer home screen (UI-02).
   Shows tenant payment list, case summary, and recent activity.
   All data from the v1 API — zero hardcoded values.
   ========================================================================== */

import { type V1Data, type V1Actions, formatUsdc, shortAddr } from "../../useV1Api.ts";
import type { V1Payment, V1Case } from "../../v1api.ts";
import { Card, Spinner } from "../../components/primitives.tsx";

const PAYMENT_LABELS: Record<string, string> = {
  OBSERVED: "Observed",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  PROOF_DRAFT: "Proof in draft",
  ANCHORED: "Receipt anchored",
  DISPUTED: "Disputed",
  UNDISPUTED: "Final",
};

const CASE_LABELS: Record<string, string> = {
  OPEN: "Open — awaiting response",
  RESPONDED: "Responded",
  UNDER_REVIEW: "Under review",
  EVIDENCE_REQUESTED: "More info requested",
  DECIDED: "Decided",
  CORRECTION_OUTSTANDING: "Correction outstanding",
  CLOSED_CORRECTED: "Closed — corrected",
  CLOSED_NO_CORRECTION: "Closed — no correction",
};

const DOT_COLORS: Record<string, string> = {
  VERIFIED: "var(--brand-500)",
  ANCHORED: "var(--ok-500)",
  DISPUTED: "var(--warn-500)",
  UNDISPUTED: "var(--ok-500)",
  OPEN: "var(--warn-500)",
  DECIDED: "var(--brand-500)",
  CLOSED_CORRECTED: "var(--ok-500)",
  CLOSED_NO_CORRECTION: "var(--ok-500)",
  OBSERVED: "var(--ink-400)",
  REJECTED: "var(--risk-600)",
};

export function Dashboard({
  data, onSelectPayment, onSelectCase,
}: {
  data: V1Data;
  actions: V1Actions;
  onSelectPayment: (paymentId: string) => void;
  onSelectCase: (caseId: string) => void;
}) {
  const { payments, cases, dashboard, loading } = data;

  if (loading && payments.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <SummaryCard label="Payments" value={dashboard?.paymentCount ?? payments.length} />
        <SummaryCard label="Open cases" value={dashboard?.openCases ?? cases.filter((c) => !c.state.startsWith("CLOSED")).length} />
        <SummaryCard label="Pending decisions" value={dashboard?.pendingDecisions ?? cases.filter((c) => c.state === "UNDER_REVIEW").length} />
      </div>

      {/* Payment ledger */}
      <Card shadow="var(--shadow-xs)" style={{ padding: 20 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 14 }}>
          Payments
        </div>
        {payments.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-fg-muted)", padding: "20px 0", textAlign: "center" }}>
            No payments yet. Import a finalized Arc USDC transfer or create a demo payout.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {payments.map((p) => (
              <PaymentRow key={p.paymentId} payment={p} onClick={() => onSelectPayment(p.paymentId)} />
            ))}
          </div>
        )}
      </Card>

      {/* Cases */}
      <Card shadow="var(--shadow-xs)" style={{ padding: 20 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 14 }}>
          Cases
        </div>
        {cases.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-fg-muted)", padding: "20px 0", textAlign: "center" }}>
            No cases yet. Open a case from a verified payment.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {cases.map((c) => (
              <CaseRow key={c.caseId} caseDoc={c} onClick={() => onSelectCase(c.caseId)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card shadow="var(--shadow-xs)" style={{ padding: "16px 20px" }}>
      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-fg-subtle)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-fg)" }}>{value}</div>
    </Card>
  );
}

function PaymentRow({ payment, onClick }: { payment: V1Payment; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--color-border)", cursor: "pointer", transition: "background .15s" }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: DOT_COLORS[payment.state] ?? "var(--ink-400)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-fg)" }}>{formatUsdc(payment.amountMicroUsdc)} USDC</div>
        <div style={{ fontSize: 11, color: "var(--color-fg-subtle)" }}>to {shortAddr(payment.recipient)} · {PAYMENT_LABELS[payment.state] ?? payment.state}</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", fontFamily: "var(--font-mono)" }}>
        {payment.items.length > 0 ? `${payment.items.length} items` : "no items"}
      </div>
    </div>
  );
}

function CaseRow({ caseDoc, onClick }: { caseDoc: V1Case; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: DOT_COLORS[caseDoc.state] ?? "var(--ink-400)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-fg)" }}>{caseDoc.caseNumber}</div>
        <div style={{ fontSize: 11, color: "var(--color-fg-subtle)" }}>{CASE_LABELS[caseDoc.state] ?? caseDoc.state} · {formatUsdc(caseDoc.challengedAmountMicroUsdc)} USDC challenged</div>
      </div>
    </div>
  );
}
