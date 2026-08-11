/* ============================================================================
   Northwind × Kestrel runnable scenario seed.

   Materialises the locked scenario (docs/scenarios/northwind-kestrel-dispute.md)
   as legacy Payout + WorkOrder + Case rows so the agent pipeline can run on it
   end-to-end: `assembleForCaseByNumber("CASE-NW01")` produces a real
   order-of-performance FAIL finding (clause 41 — payment before acceptance).

   This is the data the deterministic checks reason over. The M3 tranche is the
   contested one: paid 17 Jun 2025, BEFORE any acceptance or rejection, then
   rejected in writing 20 Jun. The ordering check reads:

     payment.paidAt            = 2025-06-17   (premature on-chain release)
     M3.submittedAt            = 2025-06-15   (starts the acceptance clock)
     M3.acceptedAt             = null         (no written acceptance — meaningful)
     M3.rejectedAt             = 2025-06-20   (written rejection, after payment)

   `null` acceptedAt routes the ordering check through the deemed-acceptance
   branch: deemed = 15 Jun + 7d = 22 Jun; paid 17 Jun → before deemed → FAIL.

   Idempotent (skips if CASE-NW01 exists) and best-effort (never blocks boot).
   Mirrors the policy-pack seed contract. Run after the Northwind policy pack is
   seeded so the scenario's clauses + law pointers are in force for the case.
   ========================================================================== */

import { canonicalHash } from "../canonical.ts";
import { Payout, WorkOrder, Case } from "../models/index.ts";

export const NORTHWIND_CASE_NUMBER = "CASE-NW01";
export const NORTHWIND_PAYMENT_ID = "nw-m3-tranche";

// Scenario wallet addresses (deterministic placeholders — this is a fixture,
// not real keys; the agent is keyless and never signs).
// Scenario wallet addresses (deterministic placeholders — this is a fixture,
// not real keys; the agent is keyless and never signs). MUST be valid 40-hex-char
// addresses: these flow into payout rows and address-normalization paths that
// throw on non-hex input.
const NORTHWIND_TREASURY = "0x000000000000000000000000000000000000b1b0"; // Northwind payer
const KESTREL_WALLET = "0x000000000000000000000000000000008e5e1000"; // Studio Kestrel

/**
 * Seed the runnable Northwind × Kestrel scenario if it isn't already present.
 * Idempotent — a repeated boot finds CASE-NW01 and skips. Best-effort: a seed
 * failure logs but never blocks boot.
 */
export async function seedNorthwindScenario(): Promise<void> {
  try {
    const existing = await Case.findOne({ caseNumber: NORTHWIND_CASE_NUMBER }).lean();
    if (existing) return; // already seeded — idempotent

    const now = "2025-06-23T00:00:00Z"; // dispute-opened timestamp (the case clock)

    // --- Payout: the contested M3 tranche, released prematurely on-chain ---
    // amount is whole-USDC ("500"). The frame-input builder converts to micro.
    await Payout.create({
      paymentId: NORTHWIND_PAYMENT_ID,
      chain: "arc",
      contractAddress: "0x0000000000000000000000000000000000000000", // fixture — no real contract
      txHash: "0x" + "0".repeat(63) + "1", // fixture tx hash (unique shape)
      amount: "500",
      refundTo: NORTHWIND_TREASURY,
      platformKey: "northwind",
      recipientKey: "kestrel",
      recipientWallet: KESTREL_WALLET,
      workOrderRef: null,
      trancheIndex: 3, // M3
      disputeDeadline: "2025-07-23T00:00:00Z",
      lockupEnd: "2025-07-23T00:00:00Z",
      status: "DISPUTED",
      receiptHash: canonicalHash({ paymentId: NORTHWIND_PAYMENT_ID }),
      paidAt: "2025-06-17T00:00:00Z", // ★ the premature M3 release
    });

    // --- WorkOrder: the full milestone contract, with the M3 lifecycle baked in ---
    // Only M3 carries lifecycle timestamps — it is the contested tranche. M1/M2
    // were accepted-and-paid in the correct order; M4 is pending. The checkInput
    // builder reads submittedAt/acceptedAt/rejectedAt per deliverable.
    await WorkOrder.create({
      platformKey: "northwind",
      recipientKey: "kestrel",
      description: "Milestone content-production contract — UI motion assets, explainer videos, brand kit. Northwind × Studio Kestrel. Governed by England & Wales law; see the Northwind policy pack.",
      deliverables: [
        {
          name: "M1 — Brand kit + design brief",
          due: "2025-05-12T00:00:00Z",
          acceptanceCriteria: "Brand system, palette, typography, brief",
          submittedAt: "2025-05-12T00:00:00Z",
          acceptedAt: "2025-05-16T00:00:00Z", // correct order: accepted, then paid 17 May
          rejectedAt: null,
        },
        {
          name: "M2 — Three explainer videos",
          due: "2025-05-28T00:00:00Z",
          acceptanceCriteria: "Three 60s explainer videos per script",
          submittedAt: "2025-05-28T00:00:00Z",
          acceptedAt: "2025-06-03T00:00:00Z", // correct order: accepted, then paid 4 Jun
          rejectedAt: null,
        },
        {
          name: "UI motion assets",
          due: "2025-06-15T00:00:00Z",
          acceptanceCriteria: "Hero animations per the motion spec; 48fps; ≤2MB per asset",
          // ★ The contested tranche — the load-bearing timeline:
          submittedAt: "2025-06-15T00:00:00Z", // starts the 7-business-day acceptance clock
          acceptedAt: null,                    // NO written acceptance (meaningful null)
          rejectedAt: "2025-06-20T00:00:00Z",  // written rejection — AFTER the 17 Jun payment
        },
        {
          name: "M4 — Final handover pack",
          due: "2025-07-15T00:00:00Z",
          acceptanceCriteria: "Source files, rendered exports, documentation",
          // M4 pending — no lifecycle events yet.
        },
      ],
      amount: "2500",
      currency: "USDC",
      status: "open",
      paymentId: NORTHWIND_PAYMENT_ID,
      documents: [],
    });

    // --- Case: Northwind disputes the 500 USDC M3 tranche ---
    // openedAt = 23 Jun (after the 20 Jun rejection). The ordering check reads
    // paidAt (17 Jun) against deemed acceptance (22 Jun) → FAIL.
    const caseBody = {
      payoutRef: NORTHWIND_PAYMENT_ID,
      openedBy: "customer",
      allegation: {
        claimType: "non_delivery",
        freeText: "Payment for M3 (UI motion assets) was released before the milestone was accepted; the work was then rejected for non-conformance. Northwind disputes the 500 USDC and seeks its return — the payment was made in the wrong order (clause 4.1).",
        amountContested: "500",
      },
      openedAt: now,
    };
    await Case.create({
      caseNumber: NORTHWIND_CASE_NUMBER,
      caseCode: "NORT-KEST-001",
      payoutRef: NORTHWIND_PAYMENT_ID,
      openedBy: "customer",
      allegationClaimType: "non_delivery",
      allegationFreeText: caseBody.allegation.freeText,
      allegationAmountContested: "500",
      status: "UNDER_REVIEW",
      infoRequestCount: 0,
      infoRequests: [],
      responseDeadline: "2025-06-26T00:00:00Z", // 72h right of reply
      caseHash: canonicalHash(caseBody),
      openedAt: now,
    });

    console.log(
      `[seed] northwind scenario inserted — ${NORTHWIND_CASE_NUMBER} (NORT-KEST-001), ` +
        `payment ${NORTHWIND_PAYMENT_ID}, M3 contested 500 USDC`,
    );
  } catch (e) {
    // Non-fatal: a missing scenario just means the demo case isn't runnable;
    // the rest of the system is unaffected.
    console.warn("[seed] northwind scenario seed failed (continuing):", e instanceof Error ? e.message : e);
  }
}
