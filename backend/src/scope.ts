import type { FilterQuery } from "mongoose";
import type { Request } from "express";
import { User, Payout, type PayoutDoc } from "./models/index.ts";
import type { Role } from "./rbac.ts";

/* ============================================================================
   Per-seat data scoping (GAP-B1, PRD §11.2, workstream PH-3).

   Previously GET /payouts and GET /cases returned everything to every seat — a
   deliberate demo simplification. This narrows what each role sees:
     - All seats → payouts + cases for their platform (platformKey match).
   This keeps the demo end-to-end visible: every party on the same platform
   sees the same payouts and cases.
   ========================================================================== */

export interface ScopeFilter {
  /** Mongoose filter for the Payouts collection. */
  payout: FilterQuery<PayoutDoc>;
  /**
   * Mongoose filter for the Cases collection. Cases carry no platformKey, so they
   * are scoped via the user's visible payout ids (case.payoutRef ∈ payoutIds).
   * null means "no cases visible".
   */
  case: FilterQuery<unknown> | null;
}

async function loadCaller(req: Request): Promise<{ role: Role; platformKey: string | null; wallet: string | null } | null> {
  const userId = req.session?.userId;
  if (!userId) return null;
  const user = await User.findById(userId).lean();
  if (!user) return null;
  return {
    role: user.role as Role,
    platformKey: user.platformKey ?? null,
    wallet: user.walletAddress ?? null,
  };
}

/** Build the list-scope filter for the calling user. Returns null if anonymous. */
export async function scopeFor(req: Request): Promise<ScopeFilter | null> {
  const caller = await loadCaller(req);
  if (!caller) return null;

  // All seats (customer / merchant / arbiter / platform_viewer) see payouts on
  // their platform. This keeps the demo end-to-end visible: the merchant sees
  // the payment the customer just made, the arbiter sees cases to decide, etc.
  // The wallet-based scoping was too strict — a merchant connecting with a
  // different wallet than the exact recipientAddress saw nothing.
  if (caller.platformKey) {
    const payout: FilterQuery<PayoutDoc> = { platformKey: caller.platformKey };
    const payoutIds = (await Payout.find(payout).select("paymentId").lean()).map((p) => p.paymentId);
    const caseFilter = payoutIds.length ? { payoutRef: { $in: payoutIds } } : { _id: null };
    return { payout, case: caseFilter };
  }

  // No scoping key — see nothing (safer than seeing everything).
  return { payout: { _id: null }, case: { _id: null } };
}
