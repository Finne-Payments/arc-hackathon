import type { CaseStage, LedgerState, Role, WalletSim } from "../types";
import type { FinneActions, ViewModel } from "../useFinne";

/* ============================================================================
   Demo controls — these mirror the DC editor's data-props panel.
   They make every branch of the prototype explorable from one place.
   ========================================================================== */

const ROLE_OPTS: Role[] = ["arbiter", "merchant", "customer", "platform"];
const STAGE_OPTS: { value: CaseStage; label: string }[] = [
  { value: "awaiting_response", label: "Awaiting response" },
  { value: "under_review", label: "Under review" },
  { value: "more_info", label: "More info requested" },
  { value: "decided", label: "Decided" },
];
const LEDGER_OPTS: LedgerState[] = ["normal", "empty", "loading", "chain_stale", "error"];
const WALLET_OPTS: { value: WalletSim; label: string }[] = [
  { value: "approves", label: "Wallet approves" },
  { value: "rejects_signature", label: "Rejects signature" },
  { value: "transaction_fails", label: "Transaction fails" },
];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[] | T[];
  value: T;
  onChange: (v: T) => void;
}) {
  const opts = (options as (T | { value: T; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  return (
    <div style={{ display: "flex", gap: 0, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden", flexWrap: "wrap" }}>
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            border: "none",
            borderRight: "1px solid var(--color-border)",
            background: value === o.value ? "var(--ink-900)" : "var(--color-surface)",
            color: value === o.value ? "#fff" : "var(--color-fg-muted)",
            padding: "5px 9px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span className="e-label">{label}</span>
      {children}
    </div>
  );
}

export function DemoControls({
  v,
  actions,
  open,
  onToggle,
}: {
  v: ViewModel;
  actions: FinneActions;
  open: boolean;
  onToggle: () => void;
}) {
  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="no-print"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 60,
          border: "1px solid var(--color-border)",
          background: "var(--ink-900)",
          color: "#fff",
          borderRadius: "var(--radius-pill)",
          padding: "9px 16px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        Demo controls
      </button>
    );
  }

  return (
    <div className="no-print" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, width: 300, maxWidth: "calc(100vw - 40px)" }}>
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="e-label" style={{ flex: 1 }}>
            Demo controls
          </span>
          <button onClick={onToggle} title="Hide" style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-fg-subtle)", fontSize: 16, lineHeight: 1, padding: 2 }}>
            ×
          </button>
        </div>
        <Field label="Role">
          <Segmented<Role> options={ROLE_OPTS} value={v.role} onChange={(r) => actions.setRoleProp(r)} />
        </Field>
        <Field label="Case stage">
          <Segmented<CaseStage> options={STAGE_OPTS} value={v.stage} onChange={(s) => actions.setCaseStage(s)} />
        </Field>
        <Field label="Ledger state">
          <Segmented<LedgerState> options={LEDGER_OPTS} value={v.ledger} onChange={(l) => actions.setLedgerState(l)} />
        </Field>
        <Field label="Wallet sim">
          <Segmented<WalletSim> options={WALLET_OPTS} value={v.walletSim} onChange={(w) => actions.setWalletSim(w)} />
        </Field>
        <Field label="Chain activity strip">
          <Segmented<string>
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            value={v.demoModeState ? "on" : "off"}
            onChange={(val) => actions.setDemoMode(val === "on")}
          />
        </Field>
      </div>
    </div>
  );
}

/* ---- Chain activity status strip (demoMode) ---- */
export function StatusStrip({ actions }: { actions: FinneActions }) {
  const items = [
    "Payment protected on Arc · tx …a1f2",
    "Case fingerprint anchored",
    "Refund signed by arbiter wallet",
    "Refund confirmed · 33 USDC to the fixed refund address",
  ];
  return (
    <div style={{ position: "fixed", left: 20, bottom: 20, zIndex: 60, display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
      <div className="e-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1 }}>Chain activity · demo</span>
        <button onClick={actions.dismissStrip} title="Hide" style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-fg-subtle)", fontSize: 14, lineHeight: 1, padding: 2 }}>
          ×
        </button>
      </div>
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--ink-900)", color: "#fff", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 12, boxShadow: "var(--shadow-lg)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand-300)", animation: i === items.length - 1 ? "pulseDot 1.6s infinite" : undefined }} />
          <span style={{ flex: 1 }}>{t}</span>
          <a title="View on Arc explorer" style={{ color: "var(--brand-300)", cursor: "pointer", fontSize: 12 }}>↗</a>
        </div>
      ))}
    </div>
  );
}

/* ---- Toasts ---- */
export function Toasts({ exportToast, copied }: { exportToast: boolean; copied: boolean }) {
  const style: React.CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: 24,
    transform: "translateX(-50%)",
    zIndex: 70,
    background: "var(--ink-900)",
    color: "#fff",
    borderRadius: "var(--radius-pill)",
    padding: "8px 18px",
    fontSize: 13,
    boxShadow: "var(--shadow-lg)",
    whiteSpace: "nowrap",
  };
  return (
    <>
      {exportToast && <div style={style}>Audit export prepared · receipts, cases, decisions and chain anchors</div>}
      {copied && <div style={style}>Copied to clipboard</div>}
    </>
  );
}
