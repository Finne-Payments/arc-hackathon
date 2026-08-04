# MVP scope — Finné registrar & evidence infrastructure

> **Status:** Reconstructed from the as-built code path (commit `289fead`) for
> review. This is the authoritative MVP scope; the full as-built system is
> documented in `docs/TECHNICAL_PRD.md` and the superseded product narrative is
> preserved in `docs/LEGACY_NARRATIVE.md`.
>
> **One-line positioning.** Finné is **registrar and evidence infrastructure**
> for stablecoin payouts on Arc. It registers a payout, records the work it was
> for, holds a shared dispute record both sides can read, and anchors every step
> as a verifiable hash. Finné is the layer *above* Circle's Refund Protocol, not
> a custodian and not an enforcer.

## The canonical target loop

From the remediation backlog (`docs/Finne_Arc_MVP_GLM_One_By_One_Issue_List.md`):

> Finalized 300 USDC Arc payment → verified receipt → bounded 100 USDC claim →
> two-sided evidence → cited non-verdict Proof Agent fact pack → named human
> decision → separate recipient-authorized 100 USDC correction → independently
> verified closure.
>
> **The original payment is never reversed.** Finné never holds funds, forces
> repayment, or lets AI make the decision.

The ten steps below are the as-built expansion of that loop.

---

## The MVP target loop (ten steps)

This is the loop the hackathon MVP demonstrates end to end. Each step maps to a
live code path.

1. **Register a work order.** A platform records the engagement — deliverables,
   amount, acceptance criteria, and a deadline — *before* money moves.
   (`POST /platforms/:key/workorders`; `backend/src/routes/workorders.ts`.)

2. **Make a protected payout.** The platform pays the recipient on Arc through
   Circle's Refund Protocol. The indexer detects the `PaymentCreated` event.
   (`pay()` on C1 → `backend/src/indexer.ts`.)

3. **Bind the receipt.** Finné assembles a payout receipt that links the on-chain
   payment to the work order, and anchors its `keccak256` hash in the Case
   Registry. From this point the payment is *explainable* — not just a wallet
   transfer.
   (`backend/src/services.ts` receipt assembly → `anchorReceipt` on C2.)

4. **Open a dispute.** Either party opens a case within the dispute window,
   stating a claim type and the contested amount. Money does **not** move here;
   the dispute is a record.
   (`POST /payouts/:id/disputes`; payment → DISPUTED.)

5. **Serve notice and right of reply.** The recipient gets in-app notice and a
   fixed **72-hour response window** to submit their reply and counter-evidence.
   (`notice_served` → AWAITING_RESPONSE; `RESPONSE_WINDOW_HOURS=72`.)

6. **One shared case record.** Both sides see the same case: allegation, terms,
   evidence for and against, missing items, and a computed timeline. No hidden
   one-sided file.
   (`GET /cases/:id` returns a byte-identical body across seats — P3.)

7. **Deterministic agent brief.** The Proof Agent runs fixed checks against the
   shared record and writes a findings-only brief. It flags what is on file and
   what is missing — it **never** renders a verdict and holds no keys.
   (`POST /agent/briefs`; verdict-shaped keys are rejected with 422.)

8. **Human decision, in writing.** A named reviewer reads the shared record and
   the brief, then records a decision with written reasons (≥ 20 characters).
   There is no automatic-decision button anywhere in the product.
   (`POST /cases/:id/decisions`; `case:decide`, reviewer seat only.)

9. **Anchor the decision.** The decision hash and a 1-byte outcome are anchored
   in the Case Registry. The decision is now part of the permanent record.
   (`anchorDecision` on C2.)

10. **Final permanent receipt.** The receipt carries the decision, the decider,
    the reasons, and the chain anchors — verifiable forever. Only hashes and
    identifiers ever touch the chain; content stays off chain.
    (`GET /payouts/:id/receipt`; append-only enforcement on Payout/Decision.)

---

## In scope — P0 (the MVP, as built)

Everything in the ten-step loop above, plus the supporting infrastructure:

- Work-order registration and the payout-receipt binding.
- Case Registry (C2) hash anchoring for receipts, cases, and decisions.
- Shared case room with right of reply and a computed timeline.
- Findings-only agent brief with a hard verdict-guard (422).
- Human decision with mandatory written reasons.
- Final permanent, hash-anchored receipt.
- RBAC permission matrix; server-side payment + case state machines.
- Canonical JSON → `keccak256` hashing with frozen golden vectors.
- Indexer (chain event → receipt/transition) and anchor worker.
- Web app (all screens API-driven; browser-wallet signing path).
- Arc testnet only.

## Next — P1 (post-MVP, explicitly not required for the hackathon)

- Real IdP authentication at the single `resolveSession` swap point (replacing
  wallet-bound demo sessions).
- Indexer finality / reorg handling and bounded cold-start.
- Anchor-worker leasing polish and managed infrastructure.
- Per-seat data scoping hardening.

## Later — P2 (main deployment, out of this document's mandate)

- A neutral cross-platform arbiter-of-record (the positioning constraint from
  PRD §3.3 — the architecture must not foreclose it).
- Circle Wallets or equivalent custodied arbiter signing as a platform option.
- Templated payout policies and policy authoring tooling.

## Explicitly OUT of the MVP

These are **not** Finné product claims and are not supported by the MVP:

- **Custody of funds by Finné.** Finné never holds USDC.
- **Forced reversal / enforced arbiter refund execution by Finné.** Any on-chain
  refund is signed by a human reviewer's *own* wallet calling the Circle rail;
  Finné's servers and agent are read-only against the chain.
- **Debt, clawback, or future-payout deduction as a Finné feature.** The
  scenario-B debt path is a capability of Circle's contract, not a Finné MVP
  promise. See `docs/LEGACY_NARRATIVE.md`.
- **Automatic decisions / AI arbitration.** None exist.
- **Mainnet deployment.** Testnet only until the audit posture changes.
- **Fiat on/off-ramps, billing, and notifications beyond in-app.**

The Circle Refund Protocol escrow mechanics (hold, refund, withdrawal, debt)
remain *factually true* descriptions of the rail Finné sits above. They are not
marketed as Finné's own capabilities.
