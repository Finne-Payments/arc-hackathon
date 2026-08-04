/* ============================================================================
   CaseRoom — the shared case record (UI-03).
   Shows allegation, response, evidence, agent analysis, and decision.
   Both sides see the same record. Recipient can respond; reviewer can decide.
   ========================================================================== */

import { useState } from "react";
import { type V1Data, type V1Actions, formatUsdc, shortAddr } from "../../useV1Api.ts";
import { Card, PrimaryButton, SecondaryButton, Spinner } from "../../components/primitives.tsx";

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

const OUTCOME_LABELS: Record<string, string> = {
  RECIPIENT_UPHELD: "Recipient upheld — no correction",
  PLATFORM_UPHELD: "Platform upheld — full correction",
  PARTIAL_PLATFORM_UPHELD: "Partial platform claim upheld",
  DISMISSED_INSUFFICIENT_EVIDENCE: "Dismissed — insufficient evidence",
};

export function CaseRoom({
  data, actions, caseId, role, onBack, onDecide, onCorrect,
}: {
  data: V1Data;
  actions: V1Actions;
  caseId: string;
  role: string;
  onBack: () => void;
  onDecide: () => void;
  onCorrect: () => void;
}) {
  const { activeCase, loading } = data;
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  if (loading && !activeCase) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (!activeCase || activeCase.case.caseId !== caseId) {
    return (
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>Loading case {caseId}…</div>
      </Card>
    );
  }

  const c = activeCase.case;
  const payment = activeCase.payment;
  const isRecipient = role === "recipient";
  const isReviewer = role === "reviewer";
  const canRespond = isRecipient && c.state === "OPEN";
  const canDecide = isReviewer && (c.state === "UNDER_REVIEW" || c.state === "EVIDENCE_REQUESTED");
  const canCorrect = role === "operations" && c.state === "DECIDED" && c.correctionAmountMicroUsdc !== null;

  const submitReply = async () => {
    if (replyText.trim().length < 1) return;
    setSending(true);
    const ok = await actions.respond(caseId, replyText.trim());
    setSending(false);
    if (ok) setReplyText("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <SecondaryButton onClick={onBack} style={{ fontSize: 12, padding: "6px 12px", marginBottom: 8 }}>← Back</SecondaryButton>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-sans)" }}>{c.caseNumber}</div>
          <div style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>{CASE_LABELS[c.state] ?? c.state}</div>
        </div>
        {payment && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{formatUsdc(c.challengedAmountMicroUsdc)} USDC</div>
            <div style={{ fontSize: 11, color: "var(--color-fg-subtle)" }}>challenged of {formatUsdc(payment.amountMicroUsdc)} USDC</div>
          </div>
        )}
      </div>

      {/* Allegation */}
      <Card shadow="var(--shadow-xs)" style={{ padding: 18 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 8 }}>
          Claim — {c.claimType}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-fg)" }}>{c.allegation}</div>
        <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
          claim hash: {shortAddr(c.claimHash)}
        </div>
      </Card>

      {/* Response */}
      {activeCase.response ? (
        <Card shadow="var(--shadow-xs)" style={{ padding: 18, border: "1px solid var(--ok-border)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ok-600)", marginBottom: 8 }}>
            Recipient response
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-fg)" }}>{activeCase.response.text}</div>
          <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginTop: 8 }}>by {shortAddr(activeCase.response.submittedBy)} · {new Date(activeCase.response.submittedAt).toLocaleString()}</div>
        </Card>
      ) : canRespond ? (
        <Card shadow="var(--shadow-xs)" style={{ padding: 18 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 8 }}>
            Your response
          </div>
          <textarea
            className="finne-textarea"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="State your side. This is recorded permanently and shown to both parties."
            style={{ width: "100%", minHeight: 80, fontSize: 13 }}
          />
          <div style={{ marginTop: 8 }}>
            <PrimaryButton onClick={submitReply} disabled={sending || replyText.trim().length === 0} style={{ fontSize: 13, padding: "8px 16px" }}>
              {sending ? "Submitting…" : "Submit response"}
            </PrimaryButton>
          </div>
        </Card>
      ) : (
        <Card shadow="var(--shadow-xs)" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>No response submitted yet.</div>
        </Card>
      )}

      {/* Evidence */}
      {activeCase.evidence.length > 0 && (
        <Card shadow="var(--shadow-xs)" style={{ padding: 18 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 8 }}>
            Evidence ({activeCase.evidence.length})
          </div>
          {activeCase.evidence.map((ev) => (
            <div key={ev.evidenceId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{ev.title}</span>
              <span style={{ fontSize: 11, color: "var(--color-fg-subtle)" }}>{ev.mimeType} · {ev.sizeBytes} bytes</span>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-fg-subtle)" }}>{shortAddr(ev.sha256)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Decision */}
      {activeCase.decision && (
        <Card shadow="var(--shadow-xs)" style={{ padding: 18, border: "1px solid var(--brand-border)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--brand-600)", marginBottom: 8 }}>
            Human decision
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{OUTCOME_LABELS[activeCase.decision.outcome] ?? activeCase.decision.outcome}</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-fg-muted)" }}>{activeCase.decision.rationale}</div>
          <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginTop: 8 }}>by {activeCase.decision.decidedBy} · {new Date(activeCase.decision.decidedAt).toLocaleString()}</div>
          {activeCase.decision.correctionAmountMicroUsdc && (
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: "var(--warn-500)" }}>
              Correction: {formatUsdc(activeCase.decision.correctionAmountMicroUsdc)} USDC — recipient-authorized
            </div>
          )}
        </Card>
      )}

      {/* Actions */}
      {canDecide && (
        <PrimaryButton onClick={onDecide} style={{ fontSize: 14, padding: "10px 20px" }}>
          Review and decide this case
        </PrimaryButton>
      )}
      {canCorrect && (
        <PrimaryButton onClick={onCorrect} style={{ fontSize: 14, padding: "10px 20px" }}>
          Issue correction instruction
        </PrimaryButton>
      )}
    </div>
  );
}
