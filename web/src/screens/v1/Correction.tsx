/* ============================================================================
   Correction — voluntary correction instruction + closure (UI-04).
   Shows the exact correction amount, destination, and voluntary nature.
   The original 300 USDC payment is never reversed; this is a separate,
   recipient-authorized 100 USDC transfer.
   ========================================================================== */

import { useState } from "react";
import { type V1Data, type V1Actions, formatUsdc, shortAddr } from "../../useV1Api.ts";
import { Card, PrimaryButton, SecondaryButton } from "../../components/primitives.tsx";

export function CorrectionScreen({
  data, actions, caseId, onBack, onDone,
}: {
  data: V1Data;
  actions: V1Actions;
  caseId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { activeCase } = data;
  const [verifying, setVerifying] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const correction = activeCase?.correction;
  const decision = activeCase?.decision;

  const handleVerify = async () => {
    if (!correction || !txHash.trim()) return;
    setVerifying(true);
    setError(null);
    const ok = await actions.verifyCorrection(correction.correctionId, txHash.trim());
    setVerifying(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => onDone(), 1500);
    } else {
      setError("Verification failed. Check the transaction hash and that it matches the instruction.");
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    const ok = await actions.declineCorrection(caseId, "Recipient declined the voluntary correction.");
    setDeclining(false);
    if (ok) onDone();
  };

  if (success) {
    return (
      <Card shadow="var(--shadow-xs)" style={{ padding: "32px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--ok-soft)", border: "1px solid var(--ok-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--ok-600)", fontSize: 20, fontWeight: 700 }}>✓</div>
        <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Correction verified</div>
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>The case is now closed. The original payment remains unchanged.</div>
      </Card>
    );
  }

  if (!correction || !decision) {
    return (
      <Card style={{ padding: 20, maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>No correction instruction found for this case.</div>
        <SecondaryButton onClick={onBack} style={{ fontSize: 12, marginTop: 12 }}>← Back</SecondaryButton>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500, margin: "0 auto" }}>
      <div>
        <SecondaryButton onClick={onBack} style={{ fontSize: 12, padding: "6px 12px", marginBottom: 8 }}>← Back to case</SecondaryButton>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Voluntary correction</div>
        <div style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>The original payment is final. This is a separate, recipient-authorized transfer.</div>
      </div>

      {/* Instruction details */}
      <Card shadow="var(--shadow-xs)" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg-subtle)" }}>Amount</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{formatUsdc(correction.amountMicroUsdc)} USDC</div>
        </div>
        <Detail label="From (recipient)" value={shortAddr(correction.recipient)} />
        <Detail label="To (platform)" value={shortAddr(correction.destination)} />
        <Detail label="Token" value={shortAddr(correction.token)} />
        <Detail label="Chain" value={`Arc Testnet (ID ${correction.chainId})`} />
        <Detail label="Expires" value={new Date(correction.expiresAt).toLocaleString()} />
        <Detail label="State" value={correction.state} />
        <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-fg-subtle)", marginTop: 10 }}>
          instruction hash: {shortAddr(correction.instructionHash)}
        </div>
      </Card>

      {/* Decision reference */}
      <Card shadow="var(--shadow-xs)" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-fg-subtle)", marginBottom: 4 }}>Based on decision</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{decision.outcome.replace(/_/g, " ")}</div>
        <div style={{ fontSize: 12, color: "var(--color-fg-muted)", marginTop: 4, lineHeight: 1.5 }}>{decision.rationale}</div>
      </Card>

      {/* Action area based on correction state */}
      {correction.state === "DRAFT" && (
        <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-border)", borderRadius: "var(--radius-md)", padding: 14, fontSize: 13, color: "var(--brand-700)" }}>
          The correction instruction has been created. The recipient must authorize this separate transfer from their wallet.
        </div>
      )}

      {correction.state === "AWAITING_SIGNATURE" && (
        <div style={{ background: "var(--warn-soft)", border: "1px solid var(--warn-border)", borderRadius: "var(--radius-md)", padding: 14, fontSize: 13, color: "var(--warn-600)" }}>
          Awaiting recipient authorization via passkey/wallet signature.
        </div>
      )}

      {correction.state === "SUBMITTED" && (
        <Card shadow="var(--shadow-xs)" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Verify the correction</div>
          <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginBottom: 8 }}>Enter the Arc transaction hash once the recipient's transfer is confirmed.</div>
          <input
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="0x… (Arc transaction hash)"
            style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <PrimaryButton onClick={handleVerify} disabled={verifying || !txHash.trim()} style={{ fontSize: 13, padding: "8px 16px" }}>
              {verifying ? "Verifying…" : "Verify + close"}
            </PrimaryButton>
          </div>
          {error && <div style={{ fontSize: 12, color: "var(--risk-600)", marginTop: 8 }}>{error}</div>}
        </Card>
      )}

      {correction.state === "VERIFIED" && (
        <div style={{ background: "var(--ok-soft)", border: "1px solid var(--ok-border)", borderRadius: "var(--radius-md)", padding: 14, fontSize: 13, color: "var(--ok-600)" }}>
          ✓ Correction verified. The case is closed.
        </div>
      )}

      {correction.state === "DECLINED" && (
        <div style={{ background: "var(--risk-soft)", border: "1px solid var(--risk-border)", borderRadius: "var(--radius-md)", padding: 14, fontSize: 13, color: "var(--risk-600)" }}>
          The recipient declined the voluntary correction. The original payment and decision remain unchanged.
        </div>
      )}

      {/* Recipient can decline */}
      {(correction.state === "DRAFT" || correction.state === "AWAITING_SIGNATURE") && (
        <SecondaryButton onClick={handleDecline} disabled={declining} style={{ fontSize: 12, padding: "8px 16px" }}>
          {declining ? "Recording decline…" : "Decline correction"}
        </SecondaryButton>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--color-border)" }}>
      <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--color-fg)" }}>{value}</span>
    </div>
  );
}
