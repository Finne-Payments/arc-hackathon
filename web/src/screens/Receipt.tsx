import { useState } from "react";
import type { FinneActions, ViewModel } from "../useFinne";
import type { ApiData } from "../useApi";
import { BackLink, Card, Eyebrow, PrimaryButton, SecondaryButton, SharedViewBadge, SpinnerLabel, StatusPill, TechChip } from "../components/primitives";
import { DocumentPreview } from "../components/DocumentPreview";
import { OpenDisputeModal } from "../components/OpenDisputeModal";
import { explorerAddr, explorerTx, receiptStatusView, shortHex, SIDE_LABEL, lockupCountdown } from "../mappers";
import { api } from "../api";
import { connectWallet, signWithdraw, isUserRejection } from "../wallet";

// Deployed Arc testnet RefundProtocol (verified bytecode 2026-08-08). Hardcoded
// fallback so the withdraw/refund path works on first render even before
// /api/config resolves; the live config value wins when present. Mirrors the
// same fallback in NewPayout.tsx. See deployments/arc-testnet.json.
const FALLBACK_REFUND_PROTOCOL = "0xEa59160B2Cdc26f1D56772094804641a1032AF90";

function ChainRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{children}</div>
    </div>
  );
}

export function Receipt({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  const isFinal = v.screen === "final";
  // Customer (payer) returns to the ledger; merchant (recipient) to their home.
  const backLabel =
    v.role === "arbiter" ? "Back to the case" : v.role === "customer" ? "All payouts" : v.role === "platform" ? "All transactions" : "Your payouts";
  const goBack = () =>
    actions.go(v.role === "arbiter" ? "case" : v.role === "customer" ? "ledger" : v.role === "platform" ? "platform" : "home");

  // Live receipt data from the API (or null if not yet loaded).
  const r = apiData?.activeReceipt ?? null;
  const payout = r?.payout ?? null;
  const workOrder = r?.workOrder ?? null;
  const decision = r?.decision ?? null;
  const evidence = r?.evidence ?? [];
  const deliverables = workOrder?.deliverables ?? [];

  // Chain wiring + platform policy come from /config; never hard-coded.
  const cfg = apiData?.config ?? null;
  const explorerBase = cfg?.explorerUrl ?? null;
  const chainName = cfg?.chainName ?? "Arc";
  const registryAddress = cfg?.caseRegistryAddress ?? null;
  const refundProtocolAddress = cfg?.refundProtocolAddress ?? FALLBACK_REFUND_PROTOCOL;
  const policySummary = cfg?.platform?.policy?.summary ?? "Money unlocks after the lockup period unless a dispute is open.";

  // Receipt status is derived from the payout's real status, not the demo
  // caseStage — a freshly-protected payout reads "Protected", not "Disputed".
  const statusView = payout ? receiptStatusView(payout) : null;

  // Open-dispute modal: only the customer (payer/claimant) can open a dispute,
  // gated in the render below by v.isClaimant. Creation is a real API call, and
  // the freshly-created case loads on success.
  const [disputeOpen, setDisputeOpen] = useState(false);
  const disputedPaymentId = payout?.paymentId ?? v.selectedPaymentId ?? "";
  const disputedAmount = payout?.amount ?? "0";

  // Withdraw state — the recipient can withdraw from inside the receipt too.
  const [withdrawing, setWithdrawing] = useState(false);
  // Document preview modal (case-party private).
  const [previewingDocId, setPreviewingDocId] = useState<string | null>(null);
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);
  // Settlement countdown — same logic as the merchant home page. The merchant
  // can only withdraw once the settlement window (lockup) has passed.
  const settlement = payout?.lockupEnd ? lockupCountdown(payout.lockupEnd) : null;
  const canWithdraw = v.isRecipient && payout && (payout.status === "WITHDRAWABLE" || payout.status === "ESCROWED") && !payout.withdrawTxHash && (settlement?.ready ?? false);

  const doWithdraw = async () => {
    if (!payout) return;
    setWithdrawing(true);
    setWithdrawMsg("Opening your wallet…");
    try {
      const cfg = await api.config().catch(() => null);
      const rpAddr = cfg?.refundProtocolAddress ?? FALLBACK_REFUND_PROTOCOL;
      if (!rpAddr) throw new Error("RefundProtocol address not configured.");
      setWithdrawMsg("Confirm the withdrawal in your wallet…");
      await connectWallet();
      setWithdrawMsg("Waiting for confirmation on Arc…");
      await signWithdraw(rpAddr, payout.paymentId);
      setWithdrawMsg("Withdrawal submitted — the indexer will confirm shortly.");
    } catch (e) {
      setWithdrawMsg(isUserRejection(e) ? "Withdrawal rejected in your wallet." : e instanceof Error ? e.message : "Withdrawal failed.");
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="rise-in print-area" style={{ maxWidth: 820, margin: 0 }}>
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <BackLink label={backLabel} onClick={goBack} />
        <span style={{ flex: 1 }} />
        <SharedViewBadge />
        {isFinal && (
          <SecondaryButton onClick={() => actions.printPage()} style={{ fontSize: 13, padding: "6px 13px" }}>
            Print / save as PDF
          </SecondaryButton>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{v.receiptTitle}</h1>
        {statusView && <StatusPill label={statusView.chipLabel} dot={statusView.chipDot} />}
      </div>
      <div style={{ fontSize: 14, color: "var(--color-fg-muted)", marginBottom: 20 }}>
        {payout ? (
          <>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-fg)" }}>{payout.amount} USDC</span>
            {workOrder?.description ? <> · {workOrder.description}</> : null}
            <> · payment {payout.paymentId} · {new Date(payout.paidAt).toLocaleDateString()}</>
          </>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <SpinnerLabel label="Loading receipt…" size={15} />
          </span>
        )}
      </div>

      {statusView?.showBanner && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--warn-soft)", border: "1px solid var(--warn-border)", borderRadius: "var(--radius-md)", padding: "13px 18px", marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn-500)" }} />
          <span style={{ fontSize: 14, flex: 1 }}>
            <strong>This payment is disputed.</strong> Reply due in {v.countdown}
          </span>
          <button
            onClick={() => actions.go("case")}
            className="hoverable"
            style={{ border: "none", cursor: "pointer", background: "var(--ink-900)", color: "#fff", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13, padding: "7px 14px", borderRadius: "var(--radius-md)" }}
          >
            Open the case
          </button>
        </div>
      )}

      {/* Settlement window banner — visible to ALL roles so everyone is aligned
          on when the funds unlock. Matches the merchant home page countdown. */}
      {payout && payout.status === "ESCROWED" && settlement && !settlement.ready && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--brand-50)", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-md)", padding: "13px 18px", marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span style={{ fontSize: 14, flex: 1, color: "var(--brand-800)" }}>
            <strong>{settlement.label}.</strong> The merchant can withdraw once the settlement window ends. Until then, the customer can open a dispute.
          </span>
        </div>
      )}
      {payout && payout.status === "ESCROWED" && settlement?.ready && v.isRecipient && !payout.withdrawTxHash && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--ok-soft)", border: "1px solid var(--ok-border)", borderRadius: "var(--radius-md)", padding: "13px 18px", marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontSize: 14, flex: 1, color: "var(--ok-600)" }}>
            <strong>Settlement window complete.</strong> You can withdraw {payout.amount} USDC now.
          </span>
        </div>
      )}

      {payout && (
        <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 16, alignItems: "start" }}>
          {/* pane one — chain */}
          <Card shadow="var(--shadow-sm)" padding="24px">
            <Eyebrow style={{ marginBottom: 16 }}>What the chain recorded</Eyebrow>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 28, fontVariantNumeric: "tabular-nums", marginBottom: 2 }}>{payout.amount} USDC</div>
            <div style={{ fontSize: 12, color: "var(--ink-400)", marginBottom: 20 }}>on {chainName} · via Circle Refund Protocol</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <ChainRow label="Customer (payer · refunds return here)">
                <TechChip short={shortHex(payout.refundTo)} full={payout.refundTo} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, payout.refundTo)} />
              </ChainRow>
              <ChainRow label="Merchant (payment recipient)">
                <TechChip short={shortHex(payout.recipientWallet)} full={payout.recipientWallet} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, payout.recipientWallet)} />
              </ChainRow>
              <ChainRow label="Transaction ID">
                <TechChip short={shortHex(payout.txHash)} full={payout.txHash} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, payout.txHash)} />
              </ChainRow>
              <ChainRow label="Payment ID">
                <TechChip short={payout.paymentId} full={payout.paymentId} onCopy={actions.copyTech} />
              </ChainRow>
              <ChainRow label="Protection ends">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-700)" }}>{payout.lockupEnd ? new Date(payout.lockupEnd).toUTCString() : "—"}</span>
              </ChainRow>
              {payout.withdrawTxHash && (
                <ChainRow label="Withdrawal transaction">
                  <TechChip short={shortHex(payout.withdrawTxHash)} full={payout.withdrawTxHash} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, payout.withdrawTxHash)} />
                </ChainRow>
              )}
              {payout.refundTxHash && (
                <ChainRow label="Refund transaction">
                  <TechChip short={shortHex(payout.refundTxHash)} full={payout.refundTxHash} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, payout.refundTxHash)} />
                </ChainRow>
              )}
              {payout.registryAnchorTx && (
                <ChainRow label="Receipt anchored on Arc">
                  <TechChip short={shortHex(payout.registryAnchorTx)} full={payout.registryAnchorTx} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, payout.registryAnchorTx)} />
                </ChainRow>
              )}
            </div>

            {/* The contracts that govern this payment — escrow + the integrity
                registry that anchors every lifecycle hash on chain. Both are
                clickable to the explorer so anyone can audit the full picture. */}
            <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 12 }}>Contracts on {chainName}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {refundProtocolAddress && (
                  <ChainRow label="Circle Refund Protocol (escrow)">
                    <TechChip short={shortHex(refundProtocolAddress)} full={refundProtocolAddress} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, refundProtocolAddress)} />
                  </ChainRow>
                )}
                {registryAddress && (
                  <ChainRow label="Finné Case Registry (hash anchoring)">
                    <TechChip short={shortHex(registryAddress)} full={registryAddress} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, registryAddress)} />
                  </ChainRow>
                )}
                {!payout.registryAnchorTx && registryAddress && (
                  <div style={{ fontSize: 12, color: "var(--ink-400)", lineHeight: 1.5 }}>
                    Receipt hash anchoring is pending — the registry worker posts it on chain shortly after payment confirms.
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* pane two — purpose */}
          <Card shadow="var(--shadow-xs)" padding="24px">
            <Eyebrow style={{ marginBottom: 16 }}>What it was for</Eyebrow>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{workOrder?.description ?? "Payment"}</div>
            <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.55, marginBottom: 16 }}>
              Work order for {workOrder?.amount ?? payout.amount} USDC.
            </div>

            {deliverables.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--color-border)" }}>
                {deliverables.map((d, i) => {
                  const match = evidence.find((e) => e.title?.toLowerCase().includes(d.name.toLowerCase().split("—")[0].trim()));
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--color-border)", fontSize: 13 }}>
                      <span style={{ color: match ? "var(--ok-600)" : "var(--warn-600)", fontWeight: 700 }}>{match ? "✓" : "○"}</span>
                      <span style={{ flex: 1 }}>{d.name}</span>
                      <span style={{ color: "var(--color-fg-subtle)" }}>due {d.due}</span>
                      <span style={{ color: match ? "var(--ok-600)" : "var(--color-fg-muted)", fontWeight: 500, minWidth: 86, textAlign: "right" }}>
                        {match ? `Delivered` : "Not on file"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Payment-time contracts/documents — case-party private (arbiter,
                merchant, customer can preview). Agents read these and surface
                summaries in any dispute. */}
            {workOrder?.documents && workOrder.documents.length > 0 && (
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <Eyebrow color="var(--color-fg-subtle)" style={{ margin: "4px 0 10px" }}>
                  Contracts & documents
                </Eyebrow>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {workOrder.documents.map((doc) => (
                    <div key={doc.documentId} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "9px 12px", fontSize: 13 }}>
                      <span style={{ flex: 1, fontWeight: 500 }}>{doc.filename}</span>
                      <span style={{ color: "var(--color-fg-subtle)", fontSize: 11 }}>{doc.mimeType} · {(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                      <button
                        onClick={() => setPreviewingDocId(doc.documentId)}
                        style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-sm)", background: "var(--brand-50)", color: "var(--brand-800)", cursor: "pointer" }}
                      >
                        Preview
                      </button>
                      {v.isReviewer && (
                        <button
                          onClick={() =>
                            api.downloadWorkOrderDocument(payout?.paymentId ?? "", doc.documentId).then((res) => window.open(res.url, "_blank")).catch(() => {})
                          }
                          style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", color: "var(--color-fg-muted)", cursor: "pointer" }}
                        >
                          Download
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.55, margin: "14px 0 16px" }}>
              Policy: {policySummary}
            </div>

            <Eyebrow color="var(--color-fg-subtle)" style={{ margin: "4px 0 10px" }}>
              Evidence on record
            </Eyebrow>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {evidence.slice(0, 5).map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "9px 12px", fontSize: 13 }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>{e.title ?? e.type}</span>
                  <span style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-pill)", padding: "1px 8px", fontSize: 11, color: "var(--color-fg-muted)" }}>{SIDE_LABEL[e.submittedBy] ?? e.submittedBy}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-fg-subtle)" }}>{e.sha256 ? shortHex(e.sha256) : "—"}</span>
                </div>
              ))}
            </div>

            {/* Withdraw — recipient can claim funds from inside the receipt */}
            {canWithdraw && (
              <div style={{ marginTop: 18 }}>
                {withdrawing ? (
                  <SpinnerLabel label={withdrawMsg ?? "Working…"} />
                ) : withdrawMsg ? (
                  <div style={{ fontSize: 12, color: "var(--color-fg-muted)" }}>{withdrawMsg}</div>
                ) : (
                  <PrimaryButton onClick={doWithdraw} style={{ fontSize: 13, padding: "9px 15px" }}>
                    Withdraw {payout?.amount} USDC
                  </PrimaryButton>
                )}
              </div>
            )}
            {payout?.withdrawTxHash && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--ok-soft)", border: "1px solid var(--ok-border)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--ok-600)" }}>
                ✓ Withdrawn — {payout.amount} USDC claimed by the recipient.
              </div>
            )}

            {/* Only the customer (the payer/claimant) can open a dispute. The
                merchant (payment recipient) responds via the case room instead. */}
            {v.screen === "receipt" && v.isClaimant && payout && payout.status !== "DISPUTED" && payout.status !== "REFUNDED" && !payout.withdrawTxHash && (
              <SecondaryButton
                onClick={() => setDisputeOpen(true)}
                style={{ marginTop: 18, fontSize: 13, padding: "9px 15px" }}
              >
                Something wrong with this payment?
              </SecondaryButton>
            )}
          </Card>
        </div>
      )}

      {/* Open-dispute modal — form → confirm → create case (real API call) */}
      {disputeOpen && disputedPaymentId && (
        <OpenDisputeModal
          paymentId={disputedPaymentId}
          amount={disputedAmount}
          onClose={() => setDisputeOpen(false)}
          onCreated={(caseNumber) => {
            setDisputeOpen(false);
            actions.viewCase(caseNumber);
          }}
        />
      )}

      {/* outcome strip — final receipt */}
      {v.showOutcome && decision && (
        <div style={{ marginTop: 16, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderLeft: "none", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
          <div style={{ height: 4, background: "var(--brand-600)" }} />
          <div style={{ padding: "24px 28px" }}>
            <Eyebrow style={{ marginBottom: 12 }}>Outcome</Eyebrow>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
              {decision.outcome === "refund" ? "Refund approved" : decision.outcome === "release" ? "Refund rejected — payout released" : "Closed with no action"} · {payout?.amount} USDC
            </div>
            <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 14 }}>
              Decided by <strong style={{ color: "var(--color-fg)" }}>{decision.decidedByName}</strong> · wallet <TechChip short={shortHex(decision.decidedByWallet)} full={decision.decidedByWallet} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, decision.decidedByWallet)} /> · {new Date(decision.decidedAt).toUTCString()}
            </div>
            {/* Refund transaction details — fund movement from escrow to customer */}
            {decision.outcome === "refund" && payout && (
              <div style={{ background: "var(--ok-soft)", border: "1px solid var(--ok-border)", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ok-600)", marginBottom: 10 }}>Refund executed</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 13 }}>
                  <div>
                    <span style={{ color: "var(--color-fg-subtle)" }}>From (escrow)</span>
                    <br />
                    <TechChip short={shortHex(refundProtocolAddress)} full={refundProtocolAddress} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, refundProtocolAddress)} />
                  </div>
                  <div>
                    <span style={{ color: "var(--color-fg-subtle)" }}>To (customer)</span>
                    <br />
                    <TechChip short={shortHex(payout.refundTo)} full={payout.refundTo} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, payout.refundTo)} />
                  </div>
                  <div>
                    <span style={{ color: "var(--color-fg-subtle)" }}>Amount</span>
                    <br />
                    <span style={{ fontWeight: 600 }}>{payout.amount} USDC</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-fg-subtle)" }}>Status</span>
                    <br />
                    <span style={{ fontWeight: 600, color: decision.refundTxHash ? "var(--ok-600)" : "var(--warn-600)" }}>{decision.refundTxHash ? "✓ Confirmed" : "Pending confirmation"}</span>
                  </div>
                  {decision.refundTxHash && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ color: "var(--color-fg-subtle)" }}>Transaction</span>
                      <br />
                      <TechChip short={shortHex(decision.refundTxHash)} full={decision.refundTxHash} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, decision.refundTxHash)} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Funds released — for reject/release outcomes. Shows the merchant
                can withdraw (or has withdrawn) the full amount. */}
            {decision.outcome === "release" && payout && (
              <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--brand-700)", marginBottom: 10 }}>Funds released to merchant</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 13 }}>
                  <div>
                    <span style={{ color: "var(--color-fg-subtle)" }}>From (escrow)</span>
                    <br />
                    <TechChip short={shortHex(refundProtocolAddress)} full={refundProtocolAddress} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, refundProtocolAddress)} />
                  </div>
                  <div>
                    <span style={{ color: "var(--color-fg-subtle)" }}>To (merchant)</span>
                    <br />
                    <TechChip short={shortHex(payout.recipientWallet)} full={payout.recipientWallet} onCopy={actions.copyTech} explorer={explorerAddr(explorerBase, payout.recipientWallet)} />
                  </div>
                  <div>
                    <span style={{ color: "var(--color-fg-subtle)" }}>Amount</span>
                    <br />
                    <span style={{ fontWeight: 600 }}>{payout.amount} USDC</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-fg-subtle)" }}>Status</span>
                    <br />
                    <span style={{ fontWeight: 600, color: payout.withdrawTxHash ? "var(--ok-600)" : "var(--brand-700)" }}>
                      {payout.withdrawTxHash ? "✓ Withdrawn" : "Ready to withdraw"}
                    </span>
                  </div>
                  {payout.withdrawTxHash && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ color: "var(--color-fg-subtle)" }}>Withdrawal transaction</span>
                      <br />
                      <TechChip short={shortHex(payout.withdrawTxHash)} full={payout.withdrawTxHash} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, payout.withdrawTxHash)} />
                    </div>
                  )}
                  {decision.refundTxHash && !payout.withdrawTxHash && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ color: "var(--color-fg-subtle)" }}>Release transaction</span>
                      <br />
                      <TechChip short={shortHex(decision.refundTxHash)} full={decision.refundTxHash} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, decision.refundTxHash)} />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "16px 18px", fontSize: 14, lineHeight: 1.65, marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 8 }}>Written reasons</div>
              {decision.reason}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", fontSize: 13 }}>
              {decision.refundTxHash && (
                <div>
                  <span style={{ color: "var(--color-fg-subtle)" }}>Refund transaction</span>
                  <br />
                  <TechChip short={shortHex(decision.refundTxHash)} full={decision.refundTxHash} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, decision.refundTxHash)} />
                </div>
              )}
              <div>
                <span style={{ color: "var(--color-fg-subtle)" }}>Decision fingerprint</span>
                <br />
                <TechChip short={shortHex(decision.decisionHash)} full={decision.decisionHash} onCopy={actions.copyTech} />
              </div>
              {decision.registryAnchorTx && (
                <div>
                  <span style={{ color: "var(--color-fg-subtle)" }}>Anchored on Arc</span>
                  <br />
                  <TechChip short={shortHex(decision.registryAnchorTx)} full={decision.registryAnchorTx} onCopy={actions.copyTech} explorer={explorerTx(explorerBase, decision.registryAnchorTx)} />
                </div>
              )}
              {payout?.receiptHash && (
                <div>
                  <span style={{ color: "var(--color-fg-subtle)" }}>Receipt fingerprint</span>
                  <br />
                  <TechChip short={shortHex(payout.receiptHash)} full={payout.receiptHash} onCopy={actions.copyTech} />
                </div>
              )}
            </div>
            <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 18, paddingTop: 14, fontSize: 13, color: "var(--color-fg-muted)" }}>
              This record is permanent. Corrections are added, never edited.
            </div>
          </div>
        </div>
      )}

      {/* receipt fingerprint footer */}
      {payout?.receiptHash && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 18px", background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--color-fg-muted)" }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z" />
          </svg>
          Receipt fingerprint anchored on {chainName} · <TechChip short={shortHex(payout.receiptHash)} full={payout.receiptHash} onCopy={actions.copyTech} />
        </div>
      )}

      {/* Inline document preview modal (case-party private). */}
      {previewingDocId && payout?.paymentId && (
        <DocumentPreview
          load={() => api.previewWorkOrderDocument(payout.paymentId, previewingDocId)}
          onClose={() => setPreviewingDocId(null)}
        />
      )}
    </div>
  );
}
