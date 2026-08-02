import type { FilterQuery } from "mongoose";
import type { Request } from "express";
import { User, Payout, type PayoutDoc } from "./models/index.ts";
import type { Role } from "./rbac.ts";

/* ============================================================================
   Per-seat data scoping (GAP-B1, PRD §11.2, workstream PH-3).

   Previously GET /payouts and GET /cases returned everything to every seat — a
   deliberate demo simplification. This narrows what each role sees:
     - recipient        → payouts to their wallet; cases on those payouts
     - reviewer         → payouts + cases for their platform (platformKey)
     - platform_viewer  → same as reviewer (read-only platform scope)

   Scoping degrades gracefully: a user with no wallet (recipients) or no
   platformKey (reviewers) sees nothing rather than everything — safer default.
   The shared receipt/case bodies (P3) are unchanged; this only filters lists.
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

  if (caller.role === "recipient") {
    // Recipient sees payouts to their own wallet. If they haven't linked a wallet
    // yet, they see nothing (safer than seeing everyone's payouts). The seeded
    // demo recipient has recipientWallet set on each Payout, so this works once
    // their User.walletAddress matches.
    if (!caller.wallet) {
      return { payout: { _id: null }, case: { _id: null } };
    }
    const payout: FilterQuery<PayoutDoc> = { recipientWallet: caller.wallet };
    const payoutIds = (await Payout.find(payout).select("paymentId").lean()).map((p) => p.paymentId);
    const caseFilter = payoutIds.length ? { payoutRef: { $in: payoutIds } } : { _id: null };
    return { payout, case: caseFilter };
  }

  // reviewer / platform_viewer: platform scope.
  if (caller.platformKey) {
    const payout: FilterQuery<PayoutDoc> = { platformKey: caller.platformKey };
    const payoutIds = (await Payout.find(payout).select("paymentId").lean()).map((p) => p.paymentId);
    const caseFilter = payoutIds.length ? { payoutRef: { $in: payoutIds } } : { _id: null };
    return { payout, case: caseFilter };
  }

  // No scoping key — see nothing (safer than seeing everything).
  return { payout: { _id: null }, case: { _id: null } };
}
