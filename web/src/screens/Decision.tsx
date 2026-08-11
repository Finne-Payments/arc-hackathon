import { useState, useEffect } from "react";
import type { FinneActions, ViewModel } from "../useFinne";
import type { ApiData } from "../useApi";
import type { DecPhase } from "../types";
import { BackLink, Card, PrimaryButton, SecondaryButton, TechChip, Spinner } from "../components/primitives";
import { FramePanel } from "../components/FramePanel";
import { explorerTx, shortHex } from "../mappers";
import { api } from "../api";
import { connectWallet, isUserRejection, readArbiter } from "../wallet";

export function Decision({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  const c = apiData?.activeCase ?? null;
  const caseNumber = c?.case?.caseNumber ?? v.selectedCaseId ?? "";
  const contested = (c?.case as { allegationAmountContested?: string })?.allegationAmountContested ?? "0";
  const total = (c?.payout as { amount?: string })?.amount ?? "0";
  const claim = (c?.case as { allegationFreeText?: string })?.allegationFreeText ?? "—";
  // The arbiter decides against the LATEST reply — show the most recent response,
  // not the first. (Earlier the index [0] always showed the oldest reply.)
  const responses = (c?.responses as { text: string }[] | undefined) ?? [];
  const reply = responses.length > 0 ? responses[responses.length - 1].text : "No reply yet.";
  const briefSummary = c?.brief?.latest
    ? `${c.brief.latest.checks.filter((ch: { result: string }) => ch.result === "pass").length} of ${c.brief.latest.checks.length} checks passed`
    : "Brief pending.";
  const refundTo = (c?.payout as { refundTo?: string })?.refundTo ?? "";
  const explorerBase = apiData?.config?.explorerUrl ?? null;

  // Arbiter name from config (display only; the arbiter ADDRESS is read from
  // the contract below for accuracy).
  const arbiterName = apiData?.config?.platform?.arbiterName ?? "the reviewer";
  // Read the arbiter from the CONTRACT (source of truth), not the Platform DB
  // record which can be stale. Falls back to the config value if the RPC fails.
  const rpAddress = apiData?.config?.refundProtocolAddress ?? "";
  const [arbiterWallet, setArbiterWallet] = useState(apiData?.config?.platform?.arbiterAddress ?? "");
  useEffect(() => {
    if (!rpAddress) return;
    let cancelled = false;
    void readArbiter(rpAddress).then((addr) => {
      if (!cancelled && addr) setArbiterWallet(addr);
    });
    return () => { cancelled = true; };
  }, [rpAddress]);
  const remaining = (() => {
    const t = Number(total), ch = Number(contested);
    return Number.isFinite(t) && Number.isFinite(ch) ? String(Math.max(0, t - ch)) : "0";
  })();

  // Preview text built from REAL payment data (addresses + amounts), not
  // config-derived names that may not match the actual payment.
  const recipientWallet = (c?.payout as { recipientWallet?: string })?.recipientWallet ?? "";
  const customerLabel = refundTo ? `the customer (${shortHex(refundTo)})` : "the customer";
  const merchantLabel = recipientWallet ? `the merchant (${shortHex(recipientWallet)})` : "the merchant";

  const previewText = (() => {
    switch (v.decOption) {
      case "approve":
        return `The contested ${contested} USDC is returned to ${customerLabel} — the funds move from the escrow contract to the customer's refund address (${refundTo ? shortHex(refundTo) : "fixed at payment time"}). The remaining ${remaining} USDC stays protected for ${merchantLabel}.`;
      case "reject":
        return `No refund. The full ${total} USDC is released immediately to ${merchantLabel} — the customer's refund claim is rejected and the merchant can withdraw right away.`;
      default:
        return "";
    }
  })();

  // The agent decision frame (turning questions / requirements / unresolved),
  // surfaced beside the reason box so the arbiter can accept lines into their
  // reasons or edit/discard them (FIN-125/127). Ported from v1.
  const frame = c?.frame ?? null;
  const onAcceptLine = (text: string) => {
    // Append the accepted line into the reason box (editable), separated by a
    // blank line if reasons already exist.
    const current = v.decReason.trim();
    v.onReason(current ? `${current}\n\n${text}` : text);
    if (caseNumber && frame) {
      void api.logFrameAction(caseNumber, { callId: frame.frameId, action: "accept", originalText: text, provenance: "model" }).catch(() => {});
    }
  };
  const onEditLine = (originalText: string, editedText: string) => {
    if (caseNumber && frame) {
      void api.logFrameAction(caseNumber, { callId: frame.frameId, action: "edit", originalText, editedText, provenance: "model" }).catch(() => {});
    }
  };

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

      <PhaseRouter
        phase={v.decPhase} v={v} actions={actions}
        refundTo={refundTo} caseNumber={caseNumber} explorerBase={explorerBase}
        contested={contested} total={total}
        recipientWallet={recipientWallet} rpAddress={rpAddress}
        arbiterName={arbiterName} arbiterWallet={arbiterWallet}
        previewText={previewText}
        txHash={v.decTxHash}
        frame={frame}
        onAcceptLine={onAcceptLine}
        onEditLine={onEditLine}
      />
    </div>
  );
}

function PhaseRouter({ phase, v, actions, refundTo, caseNumber, explorerBase, contested, total, recipientWallet, rpAddress, arbiterName, arbiterWallet, previewText, txHash, frame, onAcceptLine, onEditLine }: {
  phase: DecPhase; v: ViewModel; actions: FinneActions; refundTo: string; caseNumber: string; explorerBase: string | null;
  contested: string; total: string; recipientWallet: string; rpAddress: string; arbiterName: string; arbiterWallet: string; previewText: string;
  txHash: string | null;
  frame: import("../api").AgentFrame | null;
  onAcceptLine: (text: string) => void;
  onEditLine: (originalText: string, editedText: string) => void;
}) {
  if (phase === "idle") return <IdlePhase v={v} refundTo={refundTo} caseNumber={caseNumber} actions={actions} contested={contested} total={total} recipientWallet={recipientWallet} rpAddress={rpAddress} previewText={previewText} frame={frame} onAcceptLine={onAcceptLine} onEditLine={onEditLine} arbiterWallet={arbiterWallet} />;
  if (phase === "awaiting") return <AwaitingPhase onCancel={v.cancelSignature} contested={contested} refundTo={refundTo} />;
  if (phase === "sig_rejected") return <SigRejectedPhase onRetry={v.retrySign} onCancel={v.cancelSignature} />;
  if (phase === "pending") return <PendingPhase onCopy={actions.copyTech} refundTo={refundTo} explorerBase={explorerBase} txHash={txHash} />;
  if (phase === "failed") return <FailedPhase onRetry={v.retrySign} onCancel={v.cancelSignature} contested={contested} />;
  if (phase === "confirmed") return <ConfirmedPhase arbiterName={arbiterName} arbiterWallet={arbiterWallet} />;
  return <RecordedPhase onBack={() => actions.go("case")} arbiterName={arbiterName} arbiterWallet={arbiterWallet} />;
}

function IdlePhase({ v, refundTo, caseNumber, actions, contested, total, recipientWallet, rpAddress, previewText, frame, onAcceptLine, onEditLine, arbiterWallet }: {
  v: ViewModel; refundTo: string; caseNumber: string; actions: FinneActions;
  contested: string; total: string; recipientWallet: string; rpAddress: string; previewText: string;
  frame: import("../api").AgentFrame | null;
  onAcceptLine: (text: string) => void;
  onEditLine: (originalText: string, editedText: string) => void;
  arbiterWallet: string;
}) {
  // Wallet-signing error to surface (e.g. the wrong wallet is connected for
  // refundByArbiter). Without this the flow silently fell through to the labeled
  // simulation on any wallet error, hiding the real cause.
  const [walletError, setWalletError] = useState<string | null>(null);
  return (
    <Card shadow="var(--shadow-xs)" padding="24px">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Your reasons</div>
      <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", marginBottom: 8 }}>Both sides will read this.</div>
      <textarea className="finne-textarea" value={v.decReason} onChange={(e) => v.onReason(e.target.value)} placeholder="Explain the decision in plain words." style={{ minHeight: 88 }} />

      {v.reasonEmpty && (
        <div style={{ fontSize: 12, color: "var(--color-fg-muted)", marginTop: 8 }}>
          Write your reasons first — the options below unlock once you've written at least {v.reasonHint ? "20 characters" : "a reason"}. The decision and the reasons are recorded together.
        </div>
      )}
      {!v.reasonEmpty && !v.decOption && (
        <div style={{ fontSize: 12, color: "var(--color-fg-muted)", marginTop: 8 }}>
          Now pick a decision below to enable “Record decision”.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "18px 0", opacity: v.optionsOpacity, pointerEvents: v.optionsPointer as React.CSSProperties["pointerEvents"] }}>
        <OptionCard onClick={v.selectApprove} border={v.approveBorder} bg={v.approveBg} title="Approve refund" desc={`The contested ${contested} USDC is returned to the customer (${refundTo ? shortHex(refundTo) : "their refund address"}). Funds move from escrow to the customer.`} />
        <OptionCard onClick={v.selectReject} border={v.rejectBorder} bg={v.rejectBg} title="Reject refund and release" desc={`No refund. The full ${total} USDC is released immediately to the merchant (${recipientWallet ? shortHex(recipientWallet) : "the recipient"}), who can withdraw right away.`} />
      </div>

      {v.showPreview && (
        <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 6 }}>What happens if you confirm</div>
          {previewText}
          {v.approveSelected && refundTo && (
            <div style={{ marginTop: 8 }}>
              <strong>Refund destination (customer):</strong> <TechChip short={shortHex(refundTo)} full={refundTo} onCopy={actions.copyTech} /> · fixed at payment time
            </div>
          )}
          {v.approveSelected && recipientWallet && (
            <div style={{ marginTop: 4 }}>
              <strong>Escrow contract:</strong> <TechChip short={shortHex(rpAddress)} full={rpAddress} onCopy={actions.copyTech} /> · funds move from here to the customer
            </div>
          )}
        </div>
      )}

      {/* Decision frame (agent) — accept/edit/discard lines into the reason box
          (FIN-125/127). Ported from v1. The frame only renders when present or
          when the case has been framed; it never disrupts the wallet-signing
          flow below. */}
      <div style={{ marginBottom: 18 }}>
        <FramePanel frame={frame} onAcceptLine={onAcceptLine} onEditLine={onEditLine} />
      </div>

        {walletError && (
          <div style={{ background: "rgba(192, 42, 42, 0.08)", border: "1px solid rgba(192, 42, 42, 0.4)", borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: 14, fontSize: 13, lineHeight: 1.55, color: "var(--color-fg)" }}>
            <strong>Couldn&apos;t complete the refund.</strong> {walletError}
            {arbiterWallet && (
              <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-fg-muted)" }}>
                Sign with the arbiter wallet: {arbiterWallet}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={async () => {
            if (v.recordDisabled) return;
            setWalletError(null);
            if (v.approveSelected) {
              // APPROVE (refund): record the decision, then ALWAYS try the
              // on-chain refund via the wallet. Never silently simulate — if
              // the wallet isn't available, surface a clear error.
              try {
                // 1. Record the decision via the API → records IMMEDIATELY,
                //    returns the typed-data payload with the paymentId.
                const result = await api.decide(caseNumber, { outcome: "refund", reason: v.decReason });
                // 2. Connect the wallet + submit the on-chain refund. The
                //    connected wallet MUST be the arbiter (the contract checks).
                //    directRefundByArbiter does a pre-flight check.
                await connectWallet();
                if (result.refundTypedData) {
                  await actions.authorizeAndRelayRefund(caseNumber, result.refundTypedData);
                  return;
                }
                // If no refundTypedData (shouldn't happen), still record.
                v.recordDecision();
              } catch (e) {
                if (isUserRejection(e)) return; // user declined — stay on the decision
                setWalletError(e instanceof Error ? e.message : "The refund transaction failed.");
                return;
              }
            } else {
              // Non-refund decisions (reject/no_action): persist to the backend,
              // which closes the case server-side. Previously this only flipped
              // local phase state (a pure simulation), so the decision was never
              // recorded and the CaseRoom stayed "Under review" with the decide
              // button still visible.
              try {
                await api.decide(caseNumber, { outcome: "release", reason: v.decReason });
                // Reload the case so the CaseRoom reflects DECIDED/CLOSED and the
                // decide affordance disappears (gated on decision presence).
                actions.reloadCase();
                actions.reloadPayouts();
                v.recordDecision(); // flips local phase to "recorded"
              } catch (e) {
                setWalletError(e instanceof Error ? e.message : "Could not record the decision. Try again.");
              }
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

function AwaitingPhase({ onCancel, contested, refundTo }: { onCancel: () => void; contested: string; refundTo: string }) {
  return (
    <Card shadow="var(--shadow-md)" padding="36px" style={{ textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Spinner size={44} />
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Waiting for your wallet signature</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 400, margin: "0 auto 20px", lineHeight: 1.6 }}>
        Your wallet is asking you to sign the refund of {contested} USDC to <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{shortHex(refundTo)}</span>. Nothing moves until you sign.
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

function PendingPhase({ onCopy, refundTo, explorerBase, txHash }: { onCopy: (v: string) => void; refundTo: string; explorerBase: string | null; txHash: string | null }) {
  return (
    <Card shadow="var(--shadow-md)" padding="36px" style={{ textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Spinner size={44} color="var(--brand-600)" />
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Refund submitted</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 420, margin: "0 auto 14px", lineHeight: 1.6 }}>
        The refund transaction is on its way to <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{shortHex(refundTo)}</span>. The case will close automatically once the chain confirms.
      </div>
      {txHash && (
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
          Transaction: <TechChip short={shortHex(txHash)} full={txHash} onCopy={onCopy} explorer={explorerTx(explorerBase, txHash)} />
        </div>
      )}
    </Card>
  );
}

function FailedPhase({ onRetry, onCancel, contested }: { onRetry: () => void; onCancel: () => void; contested: string }) {
  return (
    <Card shadow="var(--shadow-xs)" style={{ border: "1px solid var(--risk-border)", padding: "28px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>The refund transaction didn't go through</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 440, margin: "0 auto 20px", lineHeight: 1.6 }}>
        The network rejected it before any money moved — the {contested} USDC is still protected in the payment contract. This usually clears on a retry.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <PrimaryButton onClick={onRetry} style={{ fontSize: 13, padding: "9px 16px" }}>Try again</PrimaryButton>
        <SecondaryButton onClick={onCancel} style={{ fontSize: 13, padding: "9px 16px" }}>Back to the decision</SecondaryButton>
      </div>
    </Card>
  );
}

function ConfirmedPhase({ arbiterName, arbiterWallet }: { arbiterName: string; arbiterWallet: string }) {
  return (
    <Card shadow="var(--shadow-xs)" style={{ border: "1px solid var(--ok-border)", padding: "32px", textAlign: "center" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--ok-soft)", border: "1px solid var(--ok-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--ok-600)", fontSize: 20, fontWeight: 700 }}>✓</div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Refund confirmed on Arc</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 4 }}>
        Decision recorded by <strong style={{ color: "var(--color-fg)" }}>{arbiterName}{arbiterWallet ? ` · wallet ${shortHex(arbiterWallet)}` : ""}</strong>
      </div>
      <div style={{ fontSize: 13, color: "var(--color-fg-subtle)" }}>Taking you to the final receipt…</div>
    </Card>
  );
}

function RecordedPhase({ onBack, arbiterName, arbiterWallet }: { onBack: () => void; arbiterName: string; arbiterWallet: string }) {
  return (
    <Card shadow="var(--shadow-xs)" style={{ border: "1px solid var(--ok-border)", padding: "32px", textAlign: "center" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--ok-soft)", border: "1px solid var(--ok-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--ok-600)", fontSize: 20, fontWeight: 700 }}>✓</div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Decision recorded</div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 18 }}>
        Recorded by <strong style={{ color: "var(--color-fg)" }}>{arbiterName}{arbiterWallet ? ` · wallet ${shortHex(arbiterWallet)}` : ""}</strong>. Both sides can now read it, with your reasons, in the case room.
      </div>
      <SecondaryButton onClick={onBack} style={{ fontSize: 13, padding: "9px 16px" }}>Back to the case</SecondaryButton>
    </Card>
  );
}
