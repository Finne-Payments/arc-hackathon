import { useMemo, useState } from "react";
import type { FinneActions } from "../useFinne";
import type { ApiData } from "../useApi";
import { BackLink, PrimaryButton, SecondaryButton, TechChip, SpinnerLabel } from "../components/primitives";
import { shortHex } from "../mappers";
import { sameAddress, useAddressBook, type AddressEntry } from "../useAddressBook";

/* ============================================================================
   New protected payout — essentials only.

   The payer's wallet signs ONE action: approve the RefundProtocol to spend the
   USDC, then call pay(). Both go through the wallet (the backend holds no payer
   key by design). The receipt is awaited, so the screen reflects the REAL
   on-chain outcome — a reverted pay() (e.g. no approval, no balance) shows as a
   failure, never a false "submitted".

   The payout row itself is created ONLY by the indexer when it detects the
   PaymentCreated event (chain-first). This screen never writes to the DB.
   ========================================================================== */

const CONFIG_FROM_ID = "__config_refund__";
const CONFIG_TO_ID = "__config_recipient__";
const NEW_ID = "__new__";

export function NewPayout({ actions, apiData }: { actions: FinneActions; apiData?: ApiData }) {
  const platform = apiData?.config?.platform ?? null;
  const recipient = apiData?.config?.recipient ?? null;
  const rpAddress = apiData?.config?.refundProtocolAddress ?? null;
  const usdcAddress = apiData?.config?.usdcAddress ?? null;
  const configRefund = platform?.refundAddress ?? "";
  const configRecipientAddr = recipient?.walletAddress ?? "";

  const { from: fromBook, to: toBook, addEntry, removeEntry } = useAddressBook();

  const fromOptions = useMemo<AddressEntry[]>(() => {
    const list = [...fromBook];
    if (configRefund && !list.some((e) => sameAddress(e.address, configRefund))) {
      list.unshift({ id: CONFIG_FROM_ID, label: platform ? `${platform.name} treasury` : "Treasury", address: configRefund });
    }
    return list;
  }, [fromBook, configRefund, platform]);

  const toOptions = useMemo<AddressEntry[]>(() => {
    const list = [...toBook];
    if (configRecipientAddr && recipient && !list.some((e) => sameAddress(e.address, configRecipientAddr))) {
      list.unshift({ id: CONFIG_TO_ID, label: recipient.displayName, address: configRecipientAddr });
    }
    return list;
  }, [toBook, configRecipientAddr, recipient]);

  const [fromId, setFromId] = useState<string>(fromOptions[0]?.id ?? "");
  const [toId, setToId] = useState<string>(toOptions[0]?.id ?? "");
  const fromEntry = fromOptions.find((e) => e.id === fromId) ?? fromOptions[0] ?? null;
  const toEntry = toOptions.find((e) => e.id === toId) ?? toOptions[0] ?? null;
  const refundAddress = fromEntry?.address ?? "";
  const recipientAddress = toEntry?.address ?? "";

  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<{ kind: "working" | "ok" | "err"; text: string } | null>(null);
  const [paying, setPaying] = useState(false);

  const numericAmount = Number(amount);
  const hasChain = !!rpAddress && rpAddress !== "0x0000000000000000000000000000000000000000";
  const valid = !!recipientAddress && !!refundAddress && amount !== "" && numericAmount > 0 && !!usdcAddress;

  const payAndProtect = async () => {
    if (!valid || !rpAddress || !usdcAddress) {
      setStatus({ kind: "err", text: "Pick a recipient and a refund wallet, and enter an amount greater than 0." });
      return;
    }
    setPaying(true);
    const phaseText: Record<string, string> = {
      connecting: "Opening your wallet…",
      approving: "Approving USDC spend — confirm in your wallet…",
      paying: "Paying into escrow — confirm in your wallet…",
      confirming: "Confirming the payment on Arc…",
    };
    setStatus({ kind: "working", text: phaseText.connecting });
    try {
      const { approveAndPay } = await import("../wallet.ts");
      const amountBase = BigInt(Math.round(numericAmount * 1_000_000));
      const { paymentId } = await approveAndPay(
        rpAddress as `0x${string}`,
        usdcAddress as `0x${string}`,
        recipientAddress as `0x${string}`,
        amountBase,
        refundAddress as `0x${string}`,
        (phase) => setStatus({ kind: "working", text: phaseText[phase] ?? "Working…" }),
      );
      setStatus({
        kind: "ok",
        text: `Payment confirmed on Arc${paymentId !== null ? ` · payment #${paymentId}` : ""}. The receipt is being built — opening the ledger.`,
      });
      setTimeout(() => actions.go("ledger"), 3500);
    } catch (e) {
      const { isUserRejection } = await import("../wallet.ts");
      if (isUserRejection(e)) {
        setStatus({ kind: "err", text: "Transaction rejected in your wallet." });
      } else {
        setStatus({ kind: "err", text: e instanceof Error ? e.message : "Payment failed on chain. Nothing moved." });
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="rise-in" style={{ maxWidth: 640, margin: 0 }}>
      <BackLink label="All payouts" onClick={() => actions.go("ledger")} />
      <h1 style={{ margin: "14px 0 6px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>
        New protected payout
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--color-fg-muted)", lineHeight: 1.6 }}>
        Funds stay protected for 30 days unless a dispute is open. If the work goes wrong, an arbiter decides — money can only return to the
        refund wallet you pick here.
      </p>

      {!hasChain && (
        <div style={{ background: "var(--risk-soft, var(--warn-soft))", border: "1px solid var(--risk-border, var(--warn-border))", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 20, fontSize: 13, color: "var(--risk-600, var(--warn-600))", lineHeight: 1.5 }}>
          <strong>Payouts are disabled — the RefundProtocol contract isn't deployed.</strong>
          <br />
          A protected payout can only be created by a real on-chain <code style={{ fontFamily: "var(--font-mono)" }}>pay()</code> on Arc.
        </div>
      )}

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* from (refund / treasury) — refunds return here */}
        <AddressField
          fieldLabel="Refund wallet (your treasury)"
          entries={fromOptions}
          selectedId={fromEntry?.id ?? ""}
          nonRemovableIds={[CONFIG_FROM_ID]}
          addTitle="Add a treasury wallet"
          nameLabel="Wallet label"
          addrPlaceholder="0x… your refund address"
          onSelect={setFromId}
          onAdd={async (label, address) => (await addEntry("from", label, address)).id}
          onRemove={(id) => void removeEntry(id)}
          onCopy={actions.copyTech}
        />

        {/* to (recipient) */}
        <AddressField
          fieldLabel="Recipient wallet"
          entries={toOptions}
          selectedId={toEntry?.id ?? ""}
          nonRemovableIds={[CONFIG_TO_ID]}
          addTitle="Add a recipient"
          nameLabel="Recipient name"
          addrPlaceholder="0x… recipient address"
          onSelect={setToId}
          onAdd={async (label, address) => (await addEntry("to", label, address)).id}
          onRemove={(id) => void removeEntry(id)}
          onCopy={actions.copyTech}
        />

        {/* amount */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 240 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Amount (USDC)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              style={{ border: "none", outline: "none", width: 90, fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--color-fg)", background: "transparent" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-fg-muted)" }}>USDC</span>
          </div>
        </div>

        {/* status */}
        {status && (
          <div
            style={{
              background: status.kind === "ok" ? "var(--ok-soft)" : status.kind === "err" ? "var(--warn-soft)" : "var(--brand-50)",
              border: `1px solid ${status.kind === "ok" ? "var(--ok-border)" : status.kind === "err" ? "var(--warn-border)" : "var(--brand-200)"}`,
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              fontSize: 13,
              color: status.kind === "ok" ? "var(--ok-600)" : status.kind === "err" ? "var(--warn-600)" : "var(--brand-800)",
              lineHeight: 1.5,
            }}
          >
            {status.kind === "working" ? <SpinnerLabel label={status.text} /> : status.text}
          </div>
        )}

        {/* pay + protect */}
        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <PrimaryButton onClick={payAndProtect} disabled={paying || !valid || !hasChain}>
            {paying ? "Confirming on Arc…" : numericAmount > 0 ? `Pay ${amount} USDC and protect` : "Pay and protect"}
          </PrimaryButton>
          <SecondaryButton onClick={() => actions.go("ledger")}>Cancel</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

/** Pick an address from a list, or add a new one inline. */
function AddressField({
  fieldLabel,
  entries,
  selectedId,
  nonRemovableIds,
  addTitle,
  nameLabel,
  addrPlaceholder,
  onSelect,
  onAdd,
  onRemove,
  onCopy,
}: {
  fieldLabel: string;
  entries: AddressEntry[];
  selectedId: string;
  nonRemovableIds: string[];
  addTitle: string;
  nameLabel: string;
  addrPlaceholder: string;
  onSelect: (id: string) => void;
  onAdd: (label: string, address: string) => Promise<string>;
  onRemove: (id: string) => void;
  onCopy?: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lbl, setLbl] = useState("");
  const [addr, setAddr] = useState("");

  const selected = entries.find((e) => e.id === selectedId) ?? entries[0] ?? null;
  const canRemove = !!(selected && !nonRemovableIds.includes(selected.id));

  const save = async () => {
    if (!lbl.trim() || !addr.trim()) return;
    setSaving(true);
    try {
      const id = await onAdd(lbl, addr);
      onSelect(id);
      setAdding(false);
      setLbl("");
      setAddr("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>{fieldLabel}</label>
      {!adding ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select
            className="finne-input"
            value={selected?.id ?? NEW_ID}
            onChange={(e) => {
              if (e.target.value === NEW_ID) setAdding(true);
              else onSelect(e.target.value);
            }}
            style={{ flex: 1, padding: "9px 12px", fontSize: 14 }}
          >
            {entries.length === 0 && <option value="">No addresses yet</option>}
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label ? `${e.label} · ${shortHex(e.address)}` : shortHex(e.address)}
              </option>
            ))}
            <option value={NEW_ID}>➕ {addTitle}</option>
          </select>
          {canRemove && (
            <a onClick={() => selected && onRemove(selected.id)} title="Remove" style={{ fontSize: 12, fontWeight: 600, color: "var(--risk-600)", cursor: "pointer", whiteSpace: "nowrap" }}>
              Remove
            </a>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: 12, background: "var(--color-bg)" }}>
          <input className="finne-input" placeholder={nameLabel} value={lbl} onChange={(e) => setLbl(e.target.value)} style={{ padding: "9px 12px", fontSize: 14 }} />
          <input className="finne-input" placeholder={addrPlaceholder} value={addr} onChange={(e) => setAddr(e.target.value)} style={{ padding: "9px 12px", fontSize: 14, fontFamily: "var(--font-mono)" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryButton onClick={save} disabled={saving || !lbl.trim() || !addr.trim()} style={{ fontSize: 13, padding: "7px 14px" }}>
              {saving ? "Saving…" : "Save & select"}
            </PrimaryButton>
            <SecondaryButton onClick={() => { setAdding(false); setLbl(""); setAddr(""); }} style={{ fontSize: 13, padding: "7px 14px" }}>
              Cancel
            </SecondaryButton>
          </div>
        </div>
      )}
      {selected && !adding && (
        <div style={{ fontSize: 12, color: "var(--color-fg-muted)" }}>
          <TechChip short={shortHex(selected.address)} full={selected.address} onCopy={onCopy} />
        </div>
      )}
    </div>
  );
}
