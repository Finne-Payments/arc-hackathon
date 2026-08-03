/* Shared types for the Finné demo app. */

export type Role = "arbiter" | "merchant" | "customer" | "platform";

export type CaseStage =
  | "awaiting_response"
  | "under_review"
  | "more_info"
  | "decided";

export type LedgerState = "normal" | "empty" | "loading" | "chain_stale" | "error";

export type WalletSim = "approves" | "rejects_signature" | "transaction_fails";

export type Screen =
  | "ledger"
  | "newpayout"
  | "receipt"
  | "final"
  | "case"
  | "decision"
  | "home"
  | "disputes"
  | "platform";

// Role → screen access (ROLE_HOME, ROLE_ALLOWED, isAllowed, homeScreenForRole)
// lives in domain/access.ts — the single source of truth, imported by App.tsx
// and useFinne.ts.

export type DecPhase =
  | "idle"
  | "awaiting"
  | "sig_rejected"
  | "pending"
  | "failed"
  | "confirmed"
  | "recorded";

export type DecOption = "approve" | "reject" | "close" | null;

export type InfoTarget = "merchant" | "customer";

export interface AddedEvidence {
  text: string;
  side: "Merchant" | "Customer";
}

export interface InfoRequest {
  target: InfoTarget;
  text: string;
}

/* ---- Row interfaces used by screens (moved from data.ts) ---- */
export type StatusDot = "warn" | "brand" | "ok" | "risk" | "ink";

export interface LedgerRow {
  recipient: string;
  amount: string;
  purpose: string;
  paid: string;
  status: { label: string; dot: Exclude<StatusDot, "ink"> };
  deadline: string;
  highlight?: boolean;
  paymentId?: string;
}
