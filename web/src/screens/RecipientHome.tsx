import { useState } from "react";
import type { FinneActions, ViewModel } from "../useFinne";
import type { ApiData } from "../useApi";
import type { CaseRow } from "../api";
import { Eyebrow, PrimaryButton, StatusPill, SpinnerLabel } from "../components/primitives";
import { payoutToRecipientView, recipientStats } from "../mappers";

/**
 * Derive the recipient's *real* case stage from the open case (if any), so the
 * home screen shows banners only when a genuine case exists — never the stale
 * demo "caseStage" default. Returns null when there is no open case.
 */
function recipientStage(cases: CaseRow[]): "awaiting" | "review" | "decided" | null {
  const open = cases.find((c) => c.status !== "CLOSED" && c.status !== "EXECUTED");
  if (!open) {
    // No open case — but check for a recently-decided one to surface the outcome.
    const decided = cases.find((c) => c.status === "CLOSED" || c.status === "EXECUTED");
    return decided ? "decided" : null;
  }
  if (open.status === "AWAITING_RESPONSE") return "awaiting";
  if (open.status === "UNDER_REVIEW") return open.infoRequestCount > 0 ? "review" : "review";
  if (open.status === "DECIDED") return "decided";
  return "review"; // OPEN or other → treat as under review
}

function formatDeadline(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return "now";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  } catch {
    return "—";
  }
}

// Same column grid as the merchant Ledger — the two payouts tables are congruent.
const COLS = "1.2fr .8fr 1.5fr .8fr 1fr 1.1fr .6fr";

function StatCard({ label, value, sub, labelColor }: { label: string; value: string; sub: string; labelColor?: string }) {
  return (
    <div style={{ padding: "16px 20px" }}>
      <Eyebrow color={labelColor} style={{ marginBottom: 10 }}>
        {label}
      </Eyebrow>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

export function RecipientHome({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  // Resolve the platform name from config so "from" shows a real name, not blank.
  const cfgPlatformName = apiData?.config?.platform?.name;

  // Live recipient payouts, mapped to the same view the merchant ledger uses.
  const rows = (apiData?.payouts ?? []).map((p) => {
    const view = payoutToRecipientView(p, p.description ?? null);
    const settled = p.status === "WITHDRAWN" || p.status === "CLEARED" || p.status === "DEBT_SETTLED";
    return {
      ...view,
      from: cfgPlatformName ?? view.from,
      purpose: view.purpose,
      deadlineLabel: view.deadline,
      withdrawable: view.withdrawable && !settled,
      settled,
      paymentId: p.paymentId,
    };
  });
  const stats = apiData ? recipientStats(apiData.payouts as never) : null;

  // Derive the recipient's case stage from the REAL open case (server-scoped to
  // their wallet), not the stale demo caseStage. No case → no banner.
  const myCases = apiData?.cases ?? [];
  const openCase = myCases.find((c) => c.status !== "CLOSED" && c.status !== "EXECUTED") ?? null;
  const stage = recipientStage(myCases);
  const replyDue = openCase?.responseDeadline ? formatDeadline(openCase.responseDeadline) : "";

  return (
    <div className="rise-in">
      <h1 style={{ margin: "0 0 24px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Your payouts</h1>

      {/* stage banners — driven by the real open case, not demo state */}
      {stage === "awaiting" && openCase && (
        <div style={{ background: "var(--color-surface)", border: "1.5px solid var(--warn-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--warn-500)", marginTop: 6, animation: "pulseDot 1.6s infinite" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>A case needs your reply · due in {replyDue}</div>
              <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.6 }}>
                The merchant is contesting part of a payment and asking for money back. Your side of the story, and anything you
                attach, carries equal weight.
              </div>
            </div>
            <button onClick={() => actions.viewCase(openCase.caseNumber)} className="hoverable" style={{ border: "none", cursor: "pointer", background: "var(--ink-900)", color: "#fff", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13, padding: "9px 16px", borderRadius: "var(--radius-md)", flexShrink: 0 }}>
              See the case and reply
            </button>
          </div>
        </div>
      )}

      {stage === "review" && openCase && (
        <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-lg)", padding: "16px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: "var(--ok-600)", fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: 14, color: "var(--brand-900)", flex: 1 }}>
            {openCase.infoRequestCount > 0
              ? "The arbiter has asked for more information — open the case to respond."
              : "Your reply has been received. The arbiter will now decide; you'll see their name and written reasons."}
          </span>
          <a onClick={() => actions.viewCase(openCase.caseNumber)} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>View the case</a>
        </div>
      )}

      {stage === "decided" && (
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", padding: "22px 24px", marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Your case has been decided</div>
          <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.65, marginBottom: 12 }}>
            The arbiter issued a decision with written reasons. Open the final receipt to see the outcome, the refund transaction, and
            the fingerprint anchored on Arc.
          </div>
          <a onClick={() => actions.go("final")} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Read the full decision</a>
        </div>
      )}

      {/* stat cards — same shape as the merchant ledger, framed for the recipient */}
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
        <StatCard label="Protected for you" value={stats?.protectedTotal ?? "0 USDC"} sub={stats?.protectedCount ?? "0 payments"} />
        <div style={{ borderLeft: "1px solid var(--color-border)" }}>
          <StatCard label="Ready to withdraw" value={String(stats?.withdrawableCount ?? 0)} sub={stats?.withdrawableTotal ?? "0 USDC"} labelColor="var(--ok-600)" />
        </div>
        <div style={{ borderLeft: "1px solid var(--color-border)" }}>
          <StatCard
            label="Open disputes"
            value={String(stats?.openDisputes ?? 0)}
            sub={openCase ? `Reply due in ${replyDue}` : "No active disputes"}
            labelColor="var(--warn-600)"
          />
        </div>
        <div style={{ borderLeft: "1px solid var(--color-border)" }}>
          <StatCard label="Withdrawn" value={stats?.withdrawnTotal ?? "0 USDC"} sub={stats?.withdrawnCount ?? "0 payments"} />
        </div>
      </div>

      {/* payouts table — congruent with the merchant ledger (same columns/styling) */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--color-border)", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)" }}>
          <span>From</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span>For</span>
          <span>Paid</span>
          <span>Status</span>
          <span>Deadline</span>
          <span />
        </div>

        {rows.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--color-fg-muted)" }}>
            No payouts yet — payments made to your wallet appear here once they're detected on Arc.
          </div>
        )}

        {rows.map((row, i) => (
          <Row key={i} row={row} countdown={v.countdown} actions={actions} isLast={i === rows.length - 1} />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  countdown,
  actions,
  isLast,
}: {
  row: {
    from: string;
    amount: string;
    purpose: string;
    paid: string;
    status: { label: string; dot: "warn" | "brand" | "ok" | "risk" | "ink" };
    deadlineLabel: string;
    highlight: boolean;
    paymentId: string;
    withdrawable: boolean;
    settled: boolean;
  };
  countdown: string;
  actions: FinneActions;
  isLast: boolean;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);

  const doWithdraw = async () => {
    setWithdrawing(true);
    setWithdrawMsg("Opening your wallet…");
    try {
      const { connectWallet, signWithdraw } = await import("../wallet.ts");
      const { api } = await import("../api.ts");
      const cfg = await api.config();
      const rpAddr = cfg.refundProtocolAddress ?? "";
      if (!rpAddr) throw new Error("RefundProtocol address not configured.");
      setWithdrawMsg("Confirm the withdrawal in your wallet…");
      await connectWallet();
      setWithdrawMsg("Waiting for confirmation on Arc…");
      await signWithdraw(rpAddr, row.paymentId);
      setWithdrawMsg("Withdrawal confirmed — the indexer will update your balance.");
    } catch (e) {
      const { isUserRejection } = await import("../wallet.ts");
      setWithdrawMsg(isUserRejection(e) ? "Withdrawal rejected in your wallet." : e instanceof Error ? e.message : "Withdrawal failed.");
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <>
      <div
        className="row-hover"
        style={{
          display: "grid",
          gridTemplateColumns: COLS,
          gap: 12,
          padding: "11px 20px",
          borderBottom: !isLast ? "1px solid var(--color-border)" : "none",
          fontSize: 13.5,
          alignItems: "center",
          background: row.highlight ? "var(--warn-soft)" : "transparent",
        }}
      >
        <span style={{ fontWeight: 600 }}>{row.from}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{row.amount}</span>
        <span>{row.purpose}</span>
        <span style={{ color: "var(--color-fg-muted)", fontSize: 13 }}>{row.paid}</span>
        <StatusPill label={row.status.label} dot={row.status.dot} />
        <span style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>
          {row.highlight ? `Reply due in ${countdown}` : row.deadlineLabel}
        </span>
        <span style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
          {/* Receipt is always available */}
          <a onClick={() => actions.viewReceipt(row.paymentId)} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Receipt</a>
          {/* Withdraw only when the lockup has passed and not yet withdrawn */}
          {row.withdrawable && !row.settled && (
            withdrawing ? (
              <SpinnerLabel label={withdrawMsg ?? "Working…"} size={15} />
            ) : withdrawMsg ? (
              <span style={{ fontSize: 11, color: "var(--color-fg-muted)", maxWidth: 160 }}>{withdrawMsg}</span>
            ) : (
              <PrimaryButton onClick={doWithdraw} style={{ fontSize: 13, padding: "7px 14px" }}>
                Withdraw
              </PrimaryButton>
            )
          )}
        </span>
      </div>
    </>
  );
}
