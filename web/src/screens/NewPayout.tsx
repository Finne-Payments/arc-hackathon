import { useState } from "react";
import type { FinneActions } from "../useFinne";
import type { ApiData } from "../useApi";
import { BackLink, PrimaryButton, SecondaryButton, TechChip } from "../components/primitives";
import { shortHex } from "../mappers";

export function NewPayout({ actions, apiData }: { actions: FinneActions; apiData?: ApiData }) {
  const platform = apiData?.config?.platform ?? null;
  const recipient = apiData?.config?.recipient ?? null;
  const refundAddress = platform?.refundAddress ?? "";
  const recipientAddress = recipient?.walletAddress ?? "";
  const rpAddress = apiData?.config?.refundProtocolAddress ?? null;

  const [amount, setAmount] = useState("33.34");
  const [status, setStatus] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const payAndProtect = async () => {
    if (!rpAddress || !recipientAddress) {
      setStatus("Missing contract or recipient configuration. Make sure the backend is running and configured.");
      return;
    }
    setPaying(true);
    setStatus(null);
    try {
      // The merchant's browser wallet signs the pay() transaction.
      const { connectWallet } = await import("../wallet.ts");
      const client = await connectWallet();
      const amountBase = BigInt(Math.round(Number(amount) * 1_000_000)); // USDC 6 decimals
      const hash = await client.writeContract({
        address: rpAddress as `0x${string}`,
        abi: [
          {
            type: "function",
            name: "pay",
            stateMutability: "nonpayable",
            inputs: [
              { name: "to", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "refundTo", type: "address" },
            ],
            outputs: [],
          },
        ],
        functionName: "pay",
        args: [recipientAddress as `0x${string}`, amountBase, (refundAddress || recipientAddress) as `0x${string}`],
        account: client.account!,
        chain: null,
      });
      setStatus(`Payment submitted! Transaction: ${hash.slice(0, 10)}…${hash.slice(-4)}`);
      // The indexer will detect the PaymentCreated event and build the receipt.
      setTimeout(() => actions.go("ledger"), 3000);
    } catch (e) {
      const { isUserRejection } = await import("../wallet.ts");
      if (isUserRejection(e)) {
        setStatus("Transaction rejected in your wallet.");
      } else {
        setStatus(e instanceof Error ? e.message : "Payment failed.");
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="rise-in" style={{ maxWidth: 720, margin: 0 }}>
      <BackLink label="All payouts" onClick={() => actions.go("ledger")} />
      <h1 style={{ margin: "14px 0 6px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>
        New protected payout
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--color-fg-muted)", lineHeight: 1.6 }}>
        The payment sits protected until the date you set. If the work goes wrong, a person at Northbeam decides — money can only return to
        your refund address.
      </p>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* recipient */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Recipient</label>
          <input className="finne-input" readOnly defaultValue={recipient ? `${recipient.displayName} · ${shortHex(recipient.walletAddress)}` : "Select a recipient"} />
        </div>

        {/* amount */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 220 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Amount (USDC)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ border: "none", outline: "none", width: 80, fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--color-fg)", background: "transparent" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-fg-muted)" }}>USDC</span>
          </div>
        </div>

        {/* deliverables */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Deliverables</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 8 }}>
            {(apiData?.activeReceipt?.workOrder?.deliverables ?? []).map((d, i) => (
              <FragmentInput key={i} name={d.name} due={`Due ${d.due}`} />
            ))}
            {(apiData?.activeReceipt?.workOrder?.deliverables ?? []).length === 0 && (
              <input className="finne-input" readOnly defaultValue="Add a deliverable…" style={{ padding: "9px 12px" }} />
            )}
          </div>
          <a style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, alignSelf: "flex-start" }}>+ Add a deliverable</a>
        </div>

        {/* policy */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Payout policy</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1.5px solid var(--brand-600)", background: "var(--brand-50)", borderRadius: "var(--radius-md)", padding: "12px 14px", cursor: "pointer" }}>
              <input type="radio" checked readOnly style={{ marginTop: 2, accentColor: "var(--brand-600)" }} />
              <span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Standard · 30-day protection</span>
                <br />
                <span style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>Money unlocks 30 days after payment unless a dispute is open.</span>
              </span>
            </label>
            <label className="hoverable" style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-md)", padding: "12px 14px", cursor: "pointer" }}>
              <input type="radio" readOnly style={{ marginTop: 2, accentColor: "var(--brand-600)" }} />
              <span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Per-deliverable · releases in parts</span>
                <br />
                <span style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>A share of the payment unlocks as each deliverable is confirmed.</span>
              </span>
            </label>
          </div>
        </div>

        {/* status message */}
        {status && (
          <div style={{ background: status.includes("submitted") ? "var(--ok-soft)" : "var(--warn-soft)", border: `1px solid ${status.includes("submitted") ? "var(--ok-border)" : "var(--warn-border)"}`, borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 13, color: status.includes("submitted") ? "var(--ok-600)" : "var(--warn-600)", lineHeight: 1.5 }}>
            {status}
          </div>
        )}

        {/* pay + protect */}
        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 20 }}>
          <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--brand-800)", marginBottom: 4 }}>Pay and protect</div>
            <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.55 }}>
              If a refund is ever approved, it can only go to <TechChip short={shortHex(refundAddress)} full={refundAddress} onCopy={actions.copyTech} /> — your treasury wallet, fixed at payment
              time. This cannot be changed later.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <PrimaryButton onClick={payAndProtect} disabled={paying}>
              {paying ? "Connecting wallet…" : `Pay ${amount} USDC and protect`}
            </PrimaryButton>
            <SecondaryButton onClick={() => actions.go("ledger")}>Cancel</SecondaryButton>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginTop: 8 }}>
            This calls <code style={{ fontFamily: "var(--font-mono)" }}>pay()</code> on the RefundProtocol via your browser wallet. The indexer detects the payment and builds the receipt.
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentInput({ name, due }: { name: string; due: string }) {
  return (
    <>
      <input className="finne-input" readOnly defaultValue={name} style={{ padding: "9px 12px" }} />
      <input className="finne-input" readOnly defaultValue={due} style={{ padding: "9px 12px", color: "var(--color-fg-muted)" }} />
    </>
  );
}
