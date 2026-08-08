# ADR 0007 — Demo reinstates the arbiter-signed debt path (D3)

- **Status:** Accepted
- **Date:** 2026-08-08
- **Decides:** Which decision beat the demo runs, and how the arbiter refund relates to ADR 0003.
- **Supersedes (for demo scope only):** the "forced recovery is out of the MVP" clause of [ADR 0003](./0003-separate-voluntary-correction.md) §Decision.

## Context

The 9 Aug demo needs the "money moves back" beat: when the reviewer decides a
refund, USDC visibly returns to the platform and — in scenario B — the contract
records a debt against the recipient that is auto-settled from their next
payout. That beat was demoted to "legacy rail behaviour" by ADR 0003, which
positioned Finné as a non-custodial registrar with only voluntary,
recipient-authorized correction.

The two repos contradicted each other on this point (the local repo's "D3"
promoted the debt path to core scope; this repo's ADR 0003 demoted it), and the
hand-off work order flagged it as a human-only decision ("Do not hand this to a
model"). That decision is now made: **the demo runs the D3 debt path.**

Crucially, the debt-path mechanism was never removed — it is live contract
behaviour and a fully-wired legacy flow:

- `RefundProtocol.refundByArbiter(uint256 paymentID)` (`onlyArbiter`) draws the
  refund from the recipient's balance if it covers the amount, otherwise from the
  **arbiter reserve** (`depositArbiterFunds`, funded by `scripts/deploy-arc.sh`)
  and records `debts[recipient]`.
- `_settleDebt` runs on every `withdraw`, sweeping the recipient's balance toward
  the debt and repaying the arbiter reserve — a deferred clawback against future
  inbound funds, never an instant reversal of the original payment.
- The legacy backend builds the unsigned `refundByArbiter` tx
  (`buildUnsignedRefundTx`), the reviewer's browser wallet signs it (`signRefund`),
  the indexer detects the `Refund` event, reads `readDebt`, and transitions the
  payout `DISPUTED → REFUNDED` (or `→ DEBT_OUTSTANDING` when debt is recorded).

What was actually broken was the **UI**, not the flow: after signing, the frontend
faked "confirmed" on a 3s timer and never reloaded the case, so the arbiter saw
"Refund confirmed" while the case room stayed `DISPUTED` with no `refundTxHash`
until a manual refresh. That is fixed alongside this ADR: the UI now waits for
the real on-chain receipt and reloads the case/receipt on an escalating schedule
until the indexer writes the result.

## Decision

For the **demo scope** (the legacy App), the arbiter-signed `refundByArbiter` debt
path (scenario B) is reinstated as the decision beat.

- A reviewer's decision of "refund" triggers a real, arbiter-signed
  `refundByArbiter` transaction against `RefundProtocol`. Money moves on chain.
- When the recipient had already withdrawn (scenario B), the arbiter reserve
  funds the refund and the contract records a debt; the recipient's next
  `withdraw` auto-settles it via `_settleDebt`. The case room surfaces the
  `DEBT_OUTSTANDING` state and the real `refundTxHash`.
- The arbiter reserve must remain funded (re-run the funding step of
  `scripts/deploy-arc.sh` if it is depleted).

## Scope boundary — what does NOT change

ADR 0003's posture is preserved everywhere except this one demo beat:

- **The v1 registrar (`/v1-app`) remains ADR 0003-compliant.** Its decision flow
  records an immutable decision and anchors a hash to `FinneCaseRegistry`; its
  correction path is the Circle Gas-Station-sponsored voluntary correction. The
  v1 layer never calls `refundByArbiter` and never imports the `RefundProtocol`
  ABI.
- **The RP-03 ABI quarantine stays intact.** `backend/src/v1/` is still scanned
  by CI; `refundByArbiter` / `RefundProtocol.json` remain barred there. The debt
  path lives only in the legacy layer (`backend/src/services.ts`, `chain/`,
  `routes/cases.ts`, `indexer.ts`), which the quarantine does not scope.
- **No new custody posture.** Finné never holds funds and never signs the refund;
  the reviewer's own browser wallet signs. The contract and reserve funding are
  unchanged from the original deploy.

## Consequences

- The demo can show the full loop: pay → dispute → decide → money returns → debt
  recorded → settled from the next payout.
- The product narrative for the demo may describe the debt path. The v1/registrar
  narrative continues to avoid "claw back / reverse" language (ADR 0003).
- If the demo moves fully to the v1 registrar after 9 Aug, this beat reverts to
  ADR 0003's registrar-only posture and this ADR is superseded in turn.
