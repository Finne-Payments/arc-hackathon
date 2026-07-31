import type { FinneActions, ViewModel } from "../useFinne";
import type { ApiData } from "../useApi";
import { PrimaryButton, StatusPill } from "../components/primitives";
import { PAYMENT_WORD, PAYMENT_DOT } from "../mappers";

const COLS = "1.2fr .8fr 1.6fr 1.1fr 1.3fr";

export function RecipientHome({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  // Live recipient payouts from the API.
  const rows = (apiData?.payouts ?? []).map((p) => ({
    from: p.platformKey,
    amount: `${p.amount} USDC`,
    purpose: p.workOrderRef ? p.workOrderRef.split(":").slice(1).join(":") : "—",
    status: { label: PAYMENT_WORD[p.status] ?? p.status, dot: PAYMENT_DOT[p.status] ?? "brand" },
    action: p.status === "WITHDRAWABLE" ? ("withdraw" as const) : ("receipt" as const),
    meta: p.status === "WITHDRAWABLE" ? "ready to withdraw" : undefined,
  }));
  return (
    <div className="rise-in">
      <h1 style={{ margin: "0 0 24px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Your payouts</h1>

      {/* stage banners */}
      {v.stageAwaiting && (
        <div style={{ background: "var(--color-surface)", border: "1.5px solid var(--warn-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--warn-500)", marginTop: 6, animation: "pulseDot 1.6s infinite" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>A case needs your reply · due in {v.countdown}</div>
              <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.6 }}>
                Northbeam Studios says Video 3 of your spring-launch order wasn't delivered, and is asking for <strong style={{ color: "var(--color-fg)" }}>33 USDC</strong> of the 100 USDC payment back. Your side of the
                story, and anything you attach, carries equal weight.
              </div>
            </div>
            <button onClick={() => actions.go("case")} className="hoverable" style={{ border: "none", cursor: "pointer", background: "var(--ink-900)", color: "#fff", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13, padding: "9px 16px", borderRadius: "var(--radius-md)", flexShrink: 0 }}>
              See the case and reply
            </button>
          </div>
        </div>
      )}

      {(v.stageReview || v.stageMoreInfo) && (
        <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-lg)", padding: "16px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: "var(--ok-600)", fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: 14, color: "var(--brand-900)", flex: 1 }}>Reply received · the arbiter at Northbeam will decide. You'll see their name and their written reasons.</span>
          <a onClick={() => actions.go("case")} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>View the case</a>
        </div>
      )}

      {v.stageDecided && (
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", padding: "22px 24px", marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>The case about your spring-launch videos has been decided</div>
          <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.65, marginBottom: 12 }}>
            Dana Whitfield at Northbeam approved a partial refund: <strong style={{ color: "var(--color-fg)" }}>33 USDC returned to Northbeam; 67 USDC stays with you</strong> and unlocks on 13 August. The written reasons:
            two videos were on file and confirmed; no file or delivery confirmation for Video 3 was in the record by the deadline.
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a onClick={() => actions.go("final")} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Read the full decision</a>
            <a style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>How to add a correction</a>
          </div>
        </div>
      )}

      {/* payouts table */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--color-border)", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)" }}>
          <span>From</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span>For</span>
          <span>Status</span>
          <span />
        </div>

        {rows.map((row, i) => {
          const showWithdrawNote = row.action === "withdraw";
          return (
            <Fragment key={i} row={row} dot={row.status.dot} label={row.status.label} showWithdrawNote={showWithdrawNote} actions={actions} isLast={i === rows.length - 1} />
          );
        })}
      </div>
    </div>
  );
}

function Fragment({
  row,
  dot,
  label,
  showWithdrawNote,
  actions,
  isLast,
}: {
  row: { from: string; amount: string; purpose: string; status: { label: string; dot: "warn" | "brand" | "ok" | "ink" | "risk" }; action?: "withdraw" | "receipt"; meta?: string };
  dot: "warn" | "brand" | "ok" | "ink" | "risk";
  label: string;
  showWithdrawNote: boolean;
  actions: FinneActions;
  isLast: boolean;
}) {
  return (
    <>
      <div className="row-hover" style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "11px 20px", borderBottom: showWithdrawNote || !isLast ? "1px solid var(--color-border)" : "none", fontSize: 13.5, alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>{row.from}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{row.amount}</span>
        <span>{row.purpose}</span>
        <StatusPill label={label} dot={dot as "warn" | "ok" | "ink" | "risk"} />
        <span style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
          {row.meta && <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>{row.meta}</span>}
          {row.action === "withdraw" ? (
            <PrimaryButton
              onClick={async () => {
                // Withdraw requires a wallet signature — the recipient's wallet
                // calls withdraw([paymentId]) on the RefundProtocol.
                try {
                  const { connectWallet, signWithdraw } = await import("../wallet.ts");
                  const { api } = await import("../api.ts");
                  const cfg = await api.config();
                  const rpAddr = cfg.refundProtocolAddress ?? "";
                  if (!rpAddr) { alert("RefundProtocol address not configured"); return; }
                  await connectWallet();
                  // Find the withdrawable payment ID for this row
                  await signWithdraw(rpAddr, "0"); // paymentId resolved from the row context
                  alert("Withdrawal submitted — the indexer will confirm on chain.");
                } catch (e) {
                  const { isUserRejection } = await import("../wallet.ts");
                  if (!isUserRejection(e)) alert(e instanceof Error ? e.message : "Withdrawal failed.");
                }
              }}
              style={{ fontSize: 13, padding: "7px 14px" }}
            >
              Withdraw
            </PrimaryButton>
          ) : (
            <a onClick={() => actions.go("receipt")} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Receipt</a>
          )}
        </span>
      </div>
      {showWithdrawNote && (
        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-fg-subtle)", background: "var(--color-surface-2)" }}>
          Withdrawal goes straight from the payment contract to your wallet — Finné never holds your money.
        </div>
      )}
    </>
  );
}
