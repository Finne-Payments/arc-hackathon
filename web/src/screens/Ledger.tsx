import type { LedgerState, LedgerRow } from "../types";
import type { FinneActions, ViewModel } from "../useFinne";
import { Eyebrow, PrimaryButton, StatusPill } from "../components/primitives";
import type { ApiData } from "../useApi";
import { ledgerStats, payoutToLedgerView } from "../mappers";

const COLS = "1.2fr .8fr 1.5fr .8fr 1fr 1.1fr .6fr";

function StatCard({
  label,
  value,
  sub,
  labelColor,
}: {
  label: string;
  value: string;
  sub: string;
  labelColor?: string;
}) {
  return (
    <div style={{ padding: "16px 20px" }}>
      <Eyebrow color={labelColor} style={{ marginBottom: 10 }}>
        {label}
      </Eyebrow>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

/** Live ledger rows from the API. Empty when the DB is empty — no seed fallback. */
function useRows(apiData?: ApiData): { rows: (LedgerRow & { paymentId?: string })[]; live: boolean } {
  if (!apiData) return { rows: [], live: false };
  // Resolve display names from config so we show real names, not raw addresses.
  const cfgRecipientWallet = apiData.config?.recipient?.walletAddress?.toLowerCase();
  const cfgRecipientName = apiData.config?.recipient?.displayName;
  const rows = apiData.payouts
    .map((p) => {
      const view = payoutToLedgerView(p as never, p.description ?? null);
      // If this payout's recipient matches the configured recipient, show their
      // real display name instead of a truncated wallet address.
      let recipient = view.recipient;
      if (cfgRecipientName && cfgRecipientWallet && p.recipientWallet?.toLowerCase() === cfgRecipientWallet) {
        recipient = cfgRecipientName;
      }
      return {
        recipient,
        amount: view.amount,
        purpose: view.purpose,
        paid: view.paid,
        status: view.status,
        deadline: view.deadline,
        highlight: p.status === "DISPUTED",
        paymentId: p.paymentId,
      };
    });
  return { rows, live: true };
}

function Row({ row, countdown, actions }: { row: (LedgerRow & { paymentId?: string }); countdown: string; actions: FinneActions }) {
  return (
    <div
      className="row-hover"
      style={{
        display: "grid",
        gridTemplateColumns: COLS,
        gap: 12,
        padding: "11px 20px",
        borderBottom: "1px solid var(--color-border)",
        fontSize: 13.5,
        alignItems: "center",
        background: row.highlight ? "var(--warn-soft)" : "transparent",
      }}
    >
      <span style={{ fontWeight: 600 }}>{row.recipient}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
        {row.amount}
      </span>
      <span>{row.purpose}</span>
      <span style={{ color: "var(--color-fg-muted)", fontSize: 13 }}>{row.paid}</span>
      <StatusPill label={row.status.label} dot={row.status.dot} />
      <span style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>
        {row.status.label === "Disputed" ? `Reply due in ${countdown}` : row.deadline}
      </span>
      <a
        onClick={() => row.paymentId && actions.viewReceipt(row.paymentId)}
        style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}
      >
        Receipt
      </a>
    </div>
  );
}

export function Ledger({
  v,
  actions,
  apiData,
}: {
  v: ViewModel;
  actions: FinneActions;
  apiData?: ApiData;
}) {
  const { rows, live } = useRows(apiData);
  const stats = live ? ledgerStats(apiData!.payouts as never) : null;
  const reserve = apiData?.status?.chain?.arbiterReserve;

  return (
    <div className="rise-in">
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "0 0 24px", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Payouts</h1>
        <span style={{ flex: 1 }} />
        <PrimaryButton onClick={() => actions.go("newpayout")} style={{ fontSize: 13, padding: "9px 15px" }}>
          + New protected payout
        </PrimaryButton>
      </div>

      {v.ledger === "chain_stale" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--warn-soft)",
            border: "1px solid var(--warn-border)",
            borderRadius: "var(--radius-md)",
            padding: "10px 16px",
            fontSize: 13,
            color: "var(--color-fg)",
            marginBottom: 16,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn-500)", animation: "pulseDot 1.6s infinite" }} />
          Showing last confirmed chain state from 14:32 · reconnecting
        </div>
      )}

      {v.ledger === "error" && (
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "48px 32px",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
            We couldn't load your payouts
          </div>
          <div style={{ fontSize: 14, color: "var(--color-fg-muted)", marginBottom: 20 }}>
            Nothing has changed on chain — this is a connection problem on our side.
          </div>
          <button
            className="hoverable"
            style={{
              border: "1.5px solid var(--ink-200)",
              background: "var(--color-surface)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: 14,
              padding: "9px 18px",
              borderRadius: "var(--radius-md)",
              color: "var(--color-fg)",
            }}
          >
            Try again
          </button>
        </div>
      )}

      {v.ledger === "empty" && (
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "56px 40px",
            textAlign: "center",
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 18, marginBottom: 10 }}>No payouts yet</div>
          <p style={{ margin: "0 auto", fontSize: 14, lineHeight: 1.6, color: "var(--color-fg-muted)", maxWidth: 460, textWrap: "pretty" }}>
            Payouts made through your payment platform appear here once Finné detects them on Arc. Each one carries a receipt binding the
            payment to the work it was for.
          </p>
        </div>
      )}

      {v.ledger === "loading" && (
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "8px 20px" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                height: 20,
                margin: "18px 0",
                borderRadius: 6,
                background:
                  "linear-gradient(90deg,var(--ink-100) 25%,var(--ink-50) 50%,var(--ink-100) 75%)",
                backgroundSize: "800px 100%",
                animation: "shimmer 1.4s linear infinite",
              }}
            />
          ))}
        </div>
      )}

      {v.ledger === "normal" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              marginBottom: 20,
              overflow: "hidden",
            }}
          >
            <StatCard label="Protected payouts" value={String(stats?.protectedCount ?? 0)} sub={stats?.escrowTotal ?? "0 USDC in escrow"} />
            <div style={{ borderLeft: "1px solid var(--color-border)" }}>
              <StatCard label="Open disputes" value={String(stats?.openDisputes ?? 0)} sub={`Oldest reply due in ${v.countdown}`} labelColor="var(--warn-600)" />
            </div>
            <div style={{ borderLeft: "1px solid var(--color-border)" }}>
              <StatCard label="Resolved this month" value={String(stats?.resolved ?? 0)} sub={stats?.resolvedSub ?? "—"} />
            </div>
            <div style={{ borderLeft: "1px solid var(--color-border)" }}>
              <StatCard label="Arbiter reserve" value={reserve ? `${reserve} USDC` : "—"} sub="Backs post-escrow refunds" />
            </div>
          </div>

          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: COLS,
                gap: 12,
                padding: "12px 20px",
                borderBottom: "1px solid var(--color-border)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: "var(--color-fg-subtle)",
              }}
            >
              <span>Recipient</span>
              <span style={{ textAlign: "right" }}>Amount</span>
              <span>For</span>
              <span>Paid</span>
              <span>Status</span>
              <span>Deadline</span>
              <span />
            </div>
            {rows.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--color-fg-muted)" }}>
                No payouts yet — protected payments appear here once they're detected on Arc.
              </div>
            )}
            {rows.map((row, i) => (
              <Row
                key={i}
                row={row}
                countdown={v.countdown}
                actions={actions}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const LEDGER_STATES: LedgerState[] = ["normal", "empty", "loading", "chain_stale", "error"];
