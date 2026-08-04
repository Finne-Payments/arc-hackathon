import type { FinneActions, ViewModel } from "../useFinne";
import type { ApiData } from "../useApi";
import type { DecPhase } from "../types";
import { BackLink, Card, PrimaryButton, SecondaryButton, TechChip, Spinner } from "../components/primitives";
import { explorerAddr, shortHex } from "../mappers";
import { api } from "../api";
import { detectWallet, connectWallet, isUserRejection } from "../wallet";

export function Decision({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  const c = apiData?.activeCase ?? null;
  const caseNumber = c?.case?.caseNumber ?? v.selectedCaseId ?? "";
  const contested = (c?.case as { allegationAmountContested?: string })?.allegationAmountContested ?? "0";
  const total = (c?.payout as { amount?: string })?.amount ?? "0";
  const claim = (c?.case as { allegationFreeText?: string })?.allegationFreeText ?? "—";
  const reply = (c?.responses as { text: string }[] | undefined)?.[0]?.text ?? "No reply yet.";
  const briefSummary = c?.brief?.latest
    ? `${c.brief.latest.checks.filter((ch: { result: string }) => ch.result === "pass").length} of ${c.brief.latest.checks.length} checks passed`
    : "Brief pending.";
  const refundTo = (c?.payout as { refundTo?: string })?.refundTo ?? "";
  const explorerBase = apiData?.config?.explorerUrl ?? null;

  return (
    <div className="rise-in" style={{ maxWidth: 820, margin: 0 }}>
      <BackLink label={caseNumber} onClick={() => actions.go("case")} />
      <h1 style={{ margin: "14px 0 4px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Decide {caseNumber}</h1>
      <div style={{ fontSize: 14, color: "var(--color-fg-muted)", marginBottom: 22 }}>{contested} USDC contested of the {total} USDC payment</div>

      {/* summary */}
      <Card shadow="var(--shadow-xs)" padding="20px 24px" style={{ marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: "8px 16px" }}>
          <span style={{ fontWeight: 600, color: "var(--color-fg-subtle)" }}>Claim</span>
          <span>{claim}</span>
          <span style={{ fontWeight: 600, color: "var(--color-fg-subtle)" }}>Reply</span>
          <span>{reply}</span>
          <span style={{ fontWeight: 600, color: "var(--color-fg-subtle)" }}>Agent</span>
          <span>
            {briefSummary}{" "}
            <a onClick={() => actions.go("case")} style={{ cursor: "pointer", fontWeight: 600 }}>Full brief</a>
          </span>
        </div>
      </Card>

      <PhaseRouter phase={v.decPhase} v={v} actions={actions} refundTo={refundTo} caseNumber={caseNumber} explorerBase={explorerBase} />
    </div>
  );
}

function PhaseRouter({ phase, v, actions, refundTo, caseNumber, explorerBase }: { phase: DecPhase; v: ViewModel; actions: FinneActions; refundTo: string; caseNumber: string; explorerBase: string | null }) {
  if (phase === "idle") return <IdlePhase v={v} refundTo={refundTo} caseNumber={caseNumber} actions={actions} />;
  if (phase === "awaiting") return <AwaitingPhase onCancel={v.cancelSignature} />;
  if (phase === "sig_rejected") return <SigRejectedPhase onRetry={v.retrySign} onCancel={v.cancelSignature} />;
  if (phase === "pending") return <PendingPhase onCopy={actions.copyTech} refundTo={refundTo} explorerBase={explorerBase} />;
  if (phase === "failed") return <FailedPhase onRetry={v.retrySign} onCancel={v.cancelSignature} />;
  if (phase === "confirmed") return <ConfirmedPhase />;
  return <RecordedPhase onBack={() => actions.go("case")} />;
}

function IdlePhase({ v, refundTo, caseNumber, actions }: { v: ViewModel; refundTo: string; caseNumber: string; actions: FinneActions }) {
  return (
    <Card shadow="var(--shadow-xs)" padding="24px">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Your reasons</div>
      <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", marginBottom: 8 }}>Both sides will read this.</div>
      <textarea className="finne-textarea" value={v.decReason} onChange={(e) => v.onReason(e.target.value)} placeholder="Explain the decision in plain words." style={{ minHeight: 88 }} />

      {v.reasonEmpty && (
        <div style={{ fontSize: 12, color: "var(--color-fg-muted)", marginTop: 8 }}>
          The options below unlock once you've written your reasons — the decision and the reasons are recorded together.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, margin: "18px 0", opacity: v.optionsOpacity, pointerEvents: v.optionsPointer as React.CSSProperties["pointerEvents"] }}>
        <OptionCard onClick={v.selectApprove} border={v.approveBorder} bg={v.approveBg} title="Approve refund" desc="The contested 100 USDC returns to Northstar's refund address, fixed when the payment was made." />
        <OptionCard onClick={v.selectReject} border={v.rejectBorder} bg={v.rejectBg} title="Reject refund and release" desc="The payout stands; Maya can withdraw when the protection window ends." />
        <OptionCard onClick={v.selectClose} border={v.closeBorder} bg={v.closeBg} title="Close with no action" desc="The dispute ends; the payout continues on its original schedule." />
      </div>

      {v.showPreview && (
        <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 6 }}>What happens if you confirm</div>
          {v.previewText}
          {v.approveSelected && (
            <div style={{ marginTop: 8 }}>
              Destination: <TechChip short={shortHex(refundTo)} full={refundTo} /> · fixed at payment time
            </div>
          )}
        </div>
      )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={async () => {
            if (v.recordDisabled) return;
            if (v.approveSelected) {
              // Refund requires a wallet signature. Try the real wallet path first;
              // fall back to the labeled simulation if no wallet is detected.
              try {
                const ws = detectWallet();
                if (ws.available) {
                  // First, record the decision via the API to get the unsigned tx.
                  const result = await api.decide(caseNumber, { outcome: "refund", reason: v.decReason });
                  if (result.unsignedTx) {
                    // Connect the wallet and sign the real transaction.
                    await connectWallet();
                    await actions.signRefundWithWallet(result.unsignedTx);
                    return;
                  }
                }
              } catch (e) {
                if (isUserRejection(e)) return; // user declined — stay on the decision
                // other wallet error → fall through to simulation
              }
              // No wallet or fallback → simulation
              v.recordDecision();
            } else {
              // Non-refund decisions are password-only (no wallet needed).
              v.recordDecision();
            }
          }}
          disabled={v.recordDisabled}
          style={{
            border: "none",
            cursor: v.recordCursor,
            background: v.recordBg,
            color: v.recordFg,
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            fontSize: 14,
            padding: "11px 20px",
            borderRadius: "var(--radius-md)",
          }}
        >
          Record decision
        </button>
        {v.approveSelected && <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>Next step: sign with your wallet — the signature is what moves the money.</span>}
      </div>
    </Card>
  );
}

function OptionCard({ onClick, border, bg, title, desc }: { onClick: () => void; border: string; bg: string; title: string; desc: string }) {
  return (
    <div onClick={onClick} className="hoverable" style={{ border: `1.5px solid ${border}`, background: bg, borderRadius: "var(--radius-md)", padding: "15px 16px", cursor: "pointer" }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--color-fg-muted)", lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function AwaitingPhase({ onCancel }: { onCancel: () => void }) {
  return (
    <Card shadow="var(--shadow-md)" padding="36px" style={{ textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Spinner size={44} />
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Waiting for your wallet signature</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 400, margin: "0 auto 20px", lineHeight: 1.6 }}>
        Your wallet is asking you to sign the refund of 100 USDC to <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>0x4B21…9d3E</span>. Nothing moves until you sign.
      </div>
      <SecondaryButton onClick={onCancel} style={{ fontSize: 13, padding: "9px 16px" }}>Cancel</SecondaryButton>
    </Card>
  );
}

function SigRejectedPhase({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) {
  return (
    <Card shadow="var(--shadow-xs)" style={{ border: "1px solid var(--warn-border)", padding: "28px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Signature declined in your wallet</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.6 }}>
        Nothing was recorded on chain and no money moved. Your decision text is kept — you can sign again or go back and change it.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <PrimaryButton onClick={onRetry} style={{ fontSize: 13, padding: "9px 16px" }}>Sign with your wallet</PrimaryButton>
        <SecondaryButton onClick={onCancel} style={{ fontSize: 13, padding: "9px 16px" }}>Back to the decision</SecondaryButton>
      </div>
    </Card>
  );
}

function PendingPhase({ onCopy, refundTo, explorerBase }: { onCopy: (v: string) => void; refundTo: string; explorerBase: string | null }) {
  return (
    <Card shadow="var(--shadow-md)" padding="36px" style={{ textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Spinner size={44} color="var(--brand-600)" />
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Signed · watching for confirmation on Arc</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
        Transaction submitted: <TechChip short={shortHex(refundTo)} full={refundTo} onCopy={onCopy} explorer={explorerAddr(explorerBase, refundTo)} />
      </div>
    </Card>
  );
}

function FailedPhase({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) {
  return (
    <Card shadow="var(--shadow-xs)" style={{ border: "1px solid var(--risk-border)", padding: "28px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>The refund transaction didn't go through</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 440, margin: "0 auto 20px", lineHeight: 1.6 }}>
        The network rejected it before any money moved — the 100 USDC is still protected in the payment contract. This usually clears on a retry.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <PrimaryButton onClick={onRetry} style={{ fontSize: 13, padding: "9px 16px" }}>Try again</PrimaryButton>
        <SecondaryButton onClick={onCancel} style={{ fontSize: 13, padding: "9px 16px" }}>Back to the decision</SecondaryButton>
      </div>
    </Card>
  );
}

function ConfirmedPhase() {
  return (
    <Card shadow="var(--shadow-xs)" style={{ border: "1px solid var(--ok-border)", padding: "32px", textAlign: "center" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--ok-soft)", border: "1px solid var(--ok-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--ok-600)", fontSize: 20, fontWeight: 700 }}>✓</div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Refund confirmed on Arc</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 4 }}>
        Decision recorded by <strong style={{ color: "var(--color-fg)" }}>Dana Whitfield · wallet 0x4B21…9d3E</strong>
      </div>
      <div style={{ fontSize: 13, color: "var(--color-fg-subtle)" }}>Taking you to the final receipt…</div>
    </Card>
  );
}

function RecordedPhase({ onBack }: { onBack: () => void }) {
  return (
    <Card shadow="var(--shadow-xs)" style={{ border: "1px solid var(--ok-border)", padding: "32px", textAlign: "center" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--ok-soft)", border: "1px solid var(--ok-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--ok-600)", fontSize: 20, fontWeight: 700 }}>✓</div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Decision recorded</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 18 }}>
        Recorded by <strong style={{ color: "var(--color-fg)" }}>Dana Whitfield · wallet 0x4B21…9d3E</strong>. Both sides can now read it, with your reasons, in the case room.
      </div>
      <SecondaryButton onClick={onBack} style={{ fontSize: 13, padding: "9px 16px" }}>Back to the case</SecondaryButton>
    </Card>
  );
}
