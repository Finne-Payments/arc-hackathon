import { useMemo, useState } from "react";
import type { FinneActions } from "../useFinne";
import type { ApiData } from "../useApi";
import { BackLink, PrimaryButton, SecondaryButton, TechChip } from "../components/primitives";
import { shortHex } from "../mappers";
import { sameAddress, uid, useAddressBook, type AddressEntry } from "../useAddressBook";

/* ============================================================================
   New protected payout. The merchant picks a refund ("from") wallet and a
   recipient ("to") wallet — either from their local address book or by adding a
   new one — sets an amount and a deliverable list, then signs pay() on the
   RefundProtocol. The address book is browser-local (useAddressBook); the
   backend config still supplies the default treasury/recipient as starter
   options so the flow works before anything is saved.
   ========================================================================== */

const CONFIG_FROM_ID = "__config_refund__";
const CONFIG_TO_ID = "__config_recipient__";
const NEW_ID = "__new__";

export function NewPayout({ actions, apiData }: { actions: FinneActions; apiData?: ApiData }) {
  const platform = apiData?.config?.platform ?? null;
  const recipient = apiData?.config?.recipient ?? null;
  const rpAddress = apiData?.config?.refundProtocolAddress ?? null;
  const configRefund = platform?.refundAddress ?? "";
  const configRecipientAddr = recipient?.walletAddress ?? "";

  const { from: fromBook, to: toBook, addEntry, removeEntry } = useAddressBook();

  // Merge the backend's default wallets in as starter options (shown unless the
  // user has already saved an entry for the same address).
  const fromOptions = useMemo<AddressEntry[]>(() => {
    const list = [...fromBook];
    if (configRefund && !list.some((e) => sameAddress(e.address, configRefund))) {
      list.unshift({
        id: CONFIG_FROM_ID,
        label: platform ? `${platform.name} treasury (default)` : "Treasury (default)",
        address: configRefund,
      });
    }
    return list;
  }, [fromBook, configRefund, platform]);

  const toOptions = useMemo<AddressEntry[]>(() => {
    const list = [...toBook];
    if (configRecipientAddr && recipient && !list.some((e) => sameAddress(e.address, configRecipientAddr))) {
      list.unshift({ id: CONFIG_TO_ID, label: `${recipient.displayName} (default)`, address: configRecipientAddr });
    }
    return list;
  }, [toBook, configRecipientAddr, recipient]);

  // Pre-select the first option (the config default) so the form is usable immediately.
  const [fromId, setFromId] = useState<string>(fromOptions[0]?.id ?? "");
  const [toId, setToId] = useState<string>(toOptions[0]?.id ?? "");

  const fromEntry = fromOptions.find((e) => e.id === fromId) ?? fromOptions[0] ?? null;
  const toEntry = toOptions.find((e) => e.id === toId) ?? toOptions[0] ?? null;
  const refundAddress = fromEntry?.address ?? "";
  const recipientAddress = toEntry?.address ?? "";

  const [amount, setAmount] = useState("");
  const [deliverables, setDeliverables] = useState<{ id: string; name: string; due: string }[]>([]);
  const [policy, setPolicy] = useState<"standard" | "perDeliverable">("standard");
  const [protectionDate, setProtectionDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [status, setStatus] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const numericAmount = Number(amount);
  const hasChain = !!rpAddress && rpAddress !== "0x0000000000000000000000000000000000000000";
  const valid = !!recipientAddress && !!refundAddress && amount !== "" && numericAmount > 0 && !!protectionDate;

  const addDeliverable = () => setDeliverables((d) => [...d, { id: uid(), name: "", due: "" }]);
  const updateDeliverable = (id: string, field: "name" | "due", value: string) =>
    setDeliverables((d) => d.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const removeDeliverable = (id: string) => setDeliverables((d) => d.filter((x) => x.id !== id));

  const payAndProtect = async () => {
    if (!recipientAddress || !refundAddress || !valid) {
      setStatus("Pick a recipient and a refund wallet, and enter an amount greater than 0.");
      return;
    }
    setPaying(true);
    setStatus(null);
    try {
      if (hasChain) {
        // Real chain path — the merchant's browser wallet signs pay() on the RefundProtocol.
        const { connectWallet } = await import("../wallet.ts");
        const client = await connectWallet();
        const amountBase = BigInt(Math.round(numericAmount * 1_000_000));
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
          args: [recipientAddress as `0x${string}`, amountBase, refundAddress as `0x${string}`],
          account: client.account!,
          chain: null,
        });
        setStatus(`Payment submitted on Arc! Transaction: ${hash.slice(0, 10)}…${hash.slice(-4)}`);
        setTimeout(() => actions.go("ledger"), 3000);
      } else {
        // No chain deployed — create the payout directly in the database.
        const { api } = await import("../api.ts");
        await api.createPayout({
          recipientWallet: recipientAddress,
          amount: String(numericAmount),
          refundTo: refundAddress,
          description: deliverables.length > 0 ? deliverables.map((d) => d.name).filter(Boolean).join(", ") : "Protected payout",
          deliverables: deliverables.filter((d) => d.name.trim()).map((d) => ({ name: d.name, due: d.due })),
          protectionDate,
        });
        setStatus(`Protected payout created. ${amount} USDC to ${shortHex(recipientAddress)} is now escrowed. Opening the ledger...`);
        setTimeout(() => actions.go("ledger"), 2500);
      }
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
        The payment sits protected until the date you set. If the work goes wrong, an arbiter decides — money can only return to the
        refund wallet you pick here.
      </p>

      {!hasChain && (
        <div style={{ background: "var(--warn-soft)", border: "1px solid var(--warn-border)", borderRadius: "var(--radius-md)", padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--warn-600)", lineHeight: 1.5 }}>
          <strong>The RefundProtocol contract is not deployed yet.</strong> Your payout will be recorded off-chain in the database.
          Once the contract is deployed to Arc testnet, payouts will be escrowed on-chain with real USDC.
        </div>
      )}

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* from (refund / treasury) — this is the MERCHANT's wallet where refunds return to */}
        <AddressField
          fieldLabel="Your treasury wallet (refund address)"
          entries={fromOptions}
          selectedId={fromEntry?.id ?? ""}
          nonRemovableIds={[CONFIG_FROM_ID]}
          addTitle="Add a treasury wallet"
          nameLabel="Wallet label (e.g. Northbeam treasury)"
          addrPlaceholder="0x… your treasury / refund address"
          onSelect={setFromId}
          onAdd={async (label, address) => (await addEntry("from", label, address)).id}
          onRemove={(id) => {
            void removeEntry(id);
          }}
          onCopy={actions.copyTech}
        />

        {/* to (recipient) — this is who gets PAID */}
        <AddressField
          fieldLabel="Recipient wallet (paid to)"
          entries={toOptions}
          selectedId={toEntry?.id ?? ""}
          nonRemovableIds={[CONFIG_TO_ID]}
          addTitle="Add a recipient"
          nameLabel="Recipient name"
          addrPlaceholder="0x… recipient wallet address"
          onSelect={setToId}
          onAdd={async (label, address) => (await addEntry("to", label, address)).id}
          onRemove={(id) => {
            void removeEntry(id);
          }}
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

        {/* protection end date */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 240 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Protection ends</label>
          <input
            type="date"
            className="finne-input"
            value={protectionDate}
            onChange={(e) => setProtectionDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            style={{ padding: "9px 12px", color: "var(--color-fg-muted)" }}
          />
          <div style={{ fontSize: 11, color: "var(--color-fg-subtle)" }}>
            Funds stay escrowed until this date unless a dispute is open.
          </div>
        </div>

        {/* deliverables */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Deliverables</label>
          {deliverables.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--color-fg-subtle)" }}>No deliverables yet. Add what the recipient owes you.</div>
          )}
          {deliverables.map((d) => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: 8, alignItems: "center" }}>
              <input className="finne-input" placeholder="Deliverable (e.g. Video 1 — product hero)" value={d.name} onChange={(e) => updateDeliverable(d.id, "name", e.target.value)} style={{ padding: "9px 12px" }} />
              <input type="date" className="finne-input" value={d.due} onChange={(e) => updateDeliverable(d.id, "due", e.target.value)} style={{ padding: "9px 12px", color: "var(--color-fg-muted)" }} />
              <a onClick={() => removeDeliverable(d.id)} title="Remove" style={{ cursor: "pointer", fontSize: 16, color: "var(--risk-600)", padding: "4px 8px" }}>×</a>
            </div>
          ))}
          <a onClick={addDeliverable} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, alignSelf: "flex-start" }}>+ Add a deliverable</a>
        </div>

        {/* policy */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Payout policy</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: policy === "standard" ? "1.5px solid var(--brand-600)" : "1.5px solid var(--ink-200)", background: policy === "standard" ? "var(--brand-50)" : "var(--color-surface)", borderRadius: "var(--radius-md)", padding: "12px 14px", cursor: "pointer" }}>
              <input type="radio" checked={policy === "standard"} onChange={() => setPolicy("standard")} style={{ marginTop: 2, accentColor: "var(--brand-600)" }} />
              <span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Standard · 30-day protection</span>
                <br />
                <span style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>Money unlocks 30 days after payment unless a dispute is open.</span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: policy === "perDeliverable" ? "1.5px solid var(--brand-600)" : "1.5px solid var(--ink-200)", background: policy === "perDeliverable" ? "var(--brand-50)" : "var(--color-surface)", borderRadius: "var(--radius-md)", padding: "12px 14px", cursor: "pointer" }}>
              <input type="radio" checked={policy === "perDeliverable"} onChange={() => setPolicy("perDeliverable")} style={{ marginTop: 2, accentColor: "var(--brand-600)" }} />
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
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--brand-800)", marginBottom: 6 }}>Pay and protect</div>
            <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.6 }}>
              <div>Paying <strong>{recipientAddress ? shortHex(recipientAddress) : "—"}</strong> (recipient)</div>
              <div style={{ marginTop: 4 }}>Refunds return to <strong>{refundAddress ? shortHex(refundAddress) : "—"}</strong> (your treasury — fixed at payment time, cannot be changed)</div>
              <div style={{ marginTop: 4 }}>Protected until <strong>{protectionDate}</strong></div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <PrimaryButton onClick={payAndProtect} disabled={paying || !valid}>
              {paying ? "Connecting wallet…" : numericAmount > 0 ? `Pay ${amount} USDC and protect` : "Pay and protect"}
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

/** Pick an address from a list, or add a new one inline. Used for from/to. */
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
            <a
              onClick={() => selected && onRemove(selected.id)}
              title="Remove from address book"
              style={{ fontSize: 12, fontWeight: 600, color: "var(--risk-600)", cursor: "pointer", whiteSpace: "nowrap" }}
            >
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
            <SecondaryButton
              onClick={() => {
                setAdding(false);
                setLbl("");
                setAddr("");
              }}
              style={{ fontSize: 13, padding: "7px 14px" }}
            >
              Cancel
            </SecondaryButton>
          </div>
        </div>
      )}
      {selected && !adding && (
        <div style={{ fontSize: 12, color: "var(--color-fg-muted)" }}>
          Wallet: <TechChip short={shortHex(selected.address)} full={selected.address} onCopy={onCopy} />
        </div>
      )}
    </div>
  );
}
