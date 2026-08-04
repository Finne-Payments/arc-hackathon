/* ============================================================================
   Decision — the human reviewer records one immutable decision (UI-03).
   Four outcomes: RECIPIENT_UPHELD, PLATFORM_UPHELD, PARTIAL_PLATFORM_UPHELD,
   DISMISSED_INSUFFICIENT_EVIDENCE. No refund signing, no money-moving tx.
   ========================================================================== */

import { useState } from "react";
import { type V1Actions, formatUsdc } from "../../useV1Api.ts";
import { Card, PrimaryButton, SecondaryButton } from "../../components/primitives.tsx";

type Outcome = "RECIPIENT_UPHELD" | "PLATFORM_UPHELD" | "PARTIAL_PLATFORM_UPHELD" | "DISMISSED_INSUFFICIENT_EVIDENCE";

const OUTCOMES: Array<{ value: Outcome; title: string; desc: string; needsCorrection: boolean }> = [
  { value: "RECIPIENT_UPHELD", title: "Recipient upheld", desc: "The recipient wins. No correction owed.", needsCorrection: false },
  { value: "PLATFORM_UPHELD", title: "Platform upheld", desc: "The platform wins. Correction = full challenged amount.", needsCorrection: true },
  { value: "PARTIAL_PLATFORM_UPHELD", title: "Partial platform claim upheld", desc: "Split outcome. Correction ≤ challenged amount.", needsCorrection: true },
  { value: "DISMISSED_INSUFFICIENT_EVIDENCE", title: "Dismissed — insufficient evidence", desc: "No correction. Case closes.", needsCorrection: false },
];

export function DecisionScreen({
  caseId, challengedAmountMicroUsdc, actions, onDone, onBack,
}: {
  caseId: string;
  challengedAmountMicroUsdc: string;
  actions: V1Actions;
  onDone: () => void;
  onBack: () => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [rationale, setRationale] = useState("");
  const [correctionAmount, setCorrectionAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selected = OUTCOMES.find((o) => o.value === outcome);
  const rationaleValid = rationale.trim().length >= 20;
  const correctionValid = !selected?.needsCorrection || (correctionAmount && BigInt(correctionAmount) > 0n && BigInt(correctionAmount) <= BigInt(challengedAmountMicroUsdc));
  const canSubmit = outcome !== null && rationaleValid && correctionValid;

  const submit = async () => {
    if (!outcome || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const ok = await actions.decide(caseId, outcome, rationale.trim(), selected?.needsCorrection ? correctionAmount : undefined);
    setSubmitting(false);
    if (ok) {
      setDone(true);
      setTimeout(() => onDone(), 1500);
    } else {
      setError("Failed to record decision. The case may not be in a decidable state.");
    }
  };

  if (done) {
    return (
      <Card shadow="var(--shadow-xs)" style={{ padding: "32px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--ok-soft)", border: "1px solid var(--ok-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--ok-600)", fontSize: 20, fontWeight: 700 }}>✓</div>
        <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Decision recorded</div>
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>The decision and your written reasons are now on the permanent record. Both sides can read them.</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 600, margin: "0 auto" }}>
      <div>
        <SecondaryButton onClick={onBack} style={{ fontSize: 12, padding: "6px 12px", marginBottom: 8 }}>← Back to case</SecondaryButton>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Record a human decision</div>
        <div style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>This decision is immutable. Your written reasons are shown to both sides.</div>
      </div>

      {/* Outcome options */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {OUTCOMES.map((o) => {
          const active = outcome === o.value;
          return (
            <div
              key={o.value}
              onClick={() => { setOutcome(o.value); setError(null); }}
              style={{
                border: active ? "2px solid var(--brand-600)" : "1px solid var(--color-border)",
                background: active ? "var(--brand-50)" : "var(--color-surface)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--brand-700)" : "var(--color-fg)", marginBottom: 3 }}>{o.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", lineHeight: 1.4 }}>{o.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Correction amount (if needed) */}
      {selected?.needsCorrection && (
        <Card shadow="var(--shadow-xs)" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Correction amount (micro-USDC)</div>
          <input
            value={correctionAmount}
            onChange={(e) => setCorrectionAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={`e.g. ${challengedAmountMicroUsdc} (max ${formatUsdc(challengedAmountMicroUsdc)} USDC)`}
            style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
        </Card>
      )}

      {/* Rationale */}
      <Card shadow="var(--shadow-xs)" style={{ padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Written reasons (min 20 characters)</div>
        <textarea
          className="finne-textarea"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Explain the decision in plain words. Both sides will read this."
          style={{ width: "100%", minHeight: 80, fontSize: 13 }}
        />
        <div style={{ fontSize: 11, color: rationaleValid ? "var(--ok-600)" : "var(--color-fg-subtle)", marginTop: 4 }}>
          {rationale.trim().length}/20 characters minimum
        </div>
      </Card>

      {error && (
        <div style={{ background: "var(--risk-soft)", border: "1px solid var(--risk-border)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 12, color: "var(--risk-600)" }}>
          {error}
        </div>
      )}

      <PrimaryButton onClick={submit} disabled={!canSubmit || submitting} style={{ fontSize: 14, padding: "10px 20px" }}>
        {submitting ? "Recording…" : "Record decision"}
      </PrimaryButton>
    </div>
  );
}
