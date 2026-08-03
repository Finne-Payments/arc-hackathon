import { useState } from "react";
import { api } from "../api";
import { SpinnerLabel } from "./primitives";
import { CLAIM_CODES, CLAIM_LABEL, DEFAULT_CLAIM_TYPE } from "../domain/statusVocabulary";

/* ============================================================================
   OpenDisputeModal — collects the dispute details and creates a real case.
   Flow: form → review/confirm → POST /payouts/:paymentId/disputes → onCreated.
   The backend anchors the case hash on chain via the operator key after
   creation; opening a dispute needs no wallet signature (only refunds do).
   ========================================================================== */

type Phase = "form" | "confirm" | "submitting";

export function OpenDisputeModal({
  paymentId,
  amount,
  onClose,
  onCreated,
}: {
  paymentId: string;
  amount: string;
  onClose: () => void;
  onCreated: (caseNumber: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("form");
  const [claimType, setClaimType] = useState<string>(DEFAULT_CLAIM_TYPE);
  const [freeText, setFreeText] = useState("");
  const [amountContested, setAmountContested] = useState("");
  const [error, setError] = useState<string | null>(null);

  const contested = amountContested.trim() || amount;

  async function submit() {
    setPhase("submitting");
    setError(null);
    try {
      const res = await api.openDispute(paymentId, {
        claimType,
        freeText: freeText.trim(),
        amountContested: contested,
      });
      onCreated(res.caseNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the dispute. Try again.");
      setPhase("confirm");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          padding: "24px 26px",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 18, color: "var(--color-fg)" }}>
            Open a dispute
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="Close" style={ghostBtn}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 18 }}>
          Payment <span style={{ fontFamily: "var(--font-mono)" }}>{paymentId}</span> · {amount} USDC
        </div>

        {phase === "form" && (
          <>
            <Field label="What went wrong?">
              <select value={claimType} onChange={(e) => setClaimType(e.target.value)} style={inputStyle}>
                {CLAIM_CODES.map((c) => (
                  <option key={c} value={c}>{CLAIM_LABEL[c]}</option>
                ))}
              </select>
            </Field>

            <Field label="Describe the dispute" hint="Required — both sides will see this.">
              <textarea
                className="finne-textarea"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Plainly: what was agreed, what happened, what's missing…"
                style={{ minHeight: 84 }}
              />
            </Field>

            <Field label="Amount to contest (USDC)" hint={`Defaults to the full ${amount} USDC if left blank.`}>
              <input
                className="finne-input"
                value={amountContested}
                onChange={(e) => setAmountContested(e.target.value)}
                placeholder={amount}
                inputMode="decimal"
                style={inputStyle}
              />
            </Field>

            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={secondaryBtn}>Cancel</button>
              <button
                onClick={() => setPhase("confirm")}
                disabled={!freeText.trim()}
                style={freeText.trim() ? primaryBtn : { ...primaryBtn, ...disabledBtn }}
              >
                Review
              </button>
            </div>
          </>
        )}

        {phase === "confirm" && (
          <>
            <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 16 }}>
              <Row label="Claim type" value={CLAIM_LABEL[claimType] ?? claimType} />
              <Row label="Amount contested" value={`${contested} USDC`} />
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 4 }}>Your statement</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-fg)" }}>“{freeText.trim()}”</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-fg-muted)", lineHeight: 1.55, marginBottom: 16 }}>
              Opening a dispute moves this payment into <strong>Disputed</strong> status and opens a shared case. The case hash is anchored on chain by Finné (no wallet signature needed from you). The other side gets a right of reply before anyone decides.
            </div>

            {error && (
              <div style={{ fontSize: 12.5, color: "var(--risk-600, var(--warn-600))", background: "var(--warn-soft)", border: "1px solid var(--warn-border)", borderRadius: "var(--radius-md)", padding: "8px 12px", marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPhase("form")} style={secondaryBtn}>Back</button>
              <button onClick={submit} style={primaryBtn}>Open this dispute</button>
            </div>
          </>
        )}

        {phase === "submitting" && (
          <div style={{ padding: "28px 0", textAlign: "center" }}>
            <SpinnerLabel label="Opening the dispute and anchoring the case…" />
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", fontSize: 13.5, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-fg)", fontFamily: "var(--font-sans)" };

const primaryBtn: React.CSSProperties = { border: "none", cursor: "pointer", background: "var(--brand-600)", color: "#fff", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13.5, padding: "9px 18px", borderRadius: "var(--radius-md)" };
const secondaryBtn: React.CSSProperties = { border: "1px solid var(--color-border)", cursor: "pointer", background: "var(--color-surface)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13.5, padding: "9px 16px", borderRadius: "var(--radius-md)" };
const disabledBtn: React.CSSProperties = { background: "var(--ink-100)", color: "var(--color-fg-subtle)", cursor: "not-allowed" };
const ghostBtn: React.CSSProperties = { border: "none", background: "transparent", cursor: "pointer", color: "var(--color-fg-subtle)", fontSize: 16, padding: "2px 6px" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg-muted)", marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: "var(--color-fg-subtle)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", fontSize: 13 }}>
      <span style={{ color: "var(--color-fg-subtle)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "var(--color-fg)" }}>{value}</span>
    </div>
  );
}
