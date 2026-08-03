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

/** Screens each role is allowed to see. Others are blocked by the route guard. */
export const ROLE_SCREENS: Record<Role, Screen[]> = {
  arbiter: ["disputes", "case", "decision", "receipt", "final"],
  merchant: ["ledger", "newpayout", "disputes", "case", "receipt", "final"],
  customer: ["home", "disputes", "case", "receipt", "final"],
  platform: ["platform", "disputes", "case", "receipt", "final"],
};

/** The default home screen for each role (shown after login / role switch). */
export const ROLE_HOME: Record<Role, Screen> = {
  arbiter: "disputes",
  merchant: "ledger",
  customer: "home",
  platform: "platform",
};

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
