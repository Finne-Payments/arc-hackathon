# Legacy product narrative

> ⚠️ **LEGACY — not the current MVP product positioning.**
>
> This document preserves the earlier Finné narrative for historical context and
> for anyone reading older commits, the original deck, or the v1/v2 PRDs. It
> describes capabilities of the rail Finné integrates with, framed — at the time
> — as Finné's own product story. **The current MVP is registrar and evidence
> infrastructure** (see `docs/scope/mvp-scope.md` and `README.md`). Nothing in
> this file is a supported product claim of the MVP.
>
> The Circle Refund Protocol mechanics described here remain *factually true* of
> the contract. They are the rail, not Finné. Finné's role is the layer above:
> register, evidence, anchor, decide-on-the-record.

---

## The earlier framing

The earlier narrative positioned Finné as a **dispute resolution system for
stablecoin payouts**, built "on" Circle's Refund Protocol, emphasizing escrow,
arbiter refunds, and debt recovery:

> Circle built the mechanism that *can* refund a stablecoin payment. Finné
> determines whether it *should* be refunded, shows why, hears both sides, and
> records the outcome: one protected payout, one dispute, one human decision,
> one on-chain correction, one permanent receipt.

## Escrow and the arbiter refund (rail capability)

Circle's Refund Protocol escrows an ERC-20 payment, fixes a refund address at
payment time, and gives a named arbiter three narrow powers: hold funds for a
lockup period, refund to the pre-set address, and permit early withdrawal for an
agreed fee. The earlier narrative described `refundByArbiter` as the execution
path for an approved refund, executed by the reviewer's arbiter wallet. Finné's
servers and agent were always read-only against the chain; the reviewer signed
from their own browser wallet.

## Debt / clawback / future-payout recovery (scenario B — rail capability)

The earlier "post-escrow clawback (scenario B)" was promoted to core scope by
decision D3: if the lockup had expired and the recipient had withdrawn, an
approved refund drew on the arbiter reserve, and the contract recorded a debt
against the recipient, repaid automatically from their next payout. Native
contract behaviour (`depositArbiterFunds`, debt registration inside
`refundByArbiter`, `_settleDebt` on `withdraw`); zero contract changes.

> **Note for the MVP:** this debt path is a capability of Circle's contract. It
> is **not** a Finné MVP promise and is not marketed as a product feature. See
> ADR 0003 (voluntary correction is separate from forced recovery).

## The tranche rule (33.33 / 33.34)

Because `_executeRefund` transfers the *full* original payment amount (the
contract has no partial refund), the earlier demo paid **one payment per
deliverable**: a 100 USDC work order settled as three payments of 33.33 / 33.33 /
33.34 USDC, so a dispute over one deliverable touched only that payment. Tranche
isolation was proven by `test_trancheIsolation`.

> **Note for the MVP:** the canonical demo now uses three videos at **100 USDC
> each (300 USDC total)** with a **100 USDC claim** for one video. The tranche
> mechanics remain true of the contract; the demo amounts were updated.

## Canonical demo (superseded)

The earlier demo fixtures used **Northbeam Studios** (merchant/platform) and
**Maya Reyes** (recipient), a 100 USDC total payout split into 33.33/33.33/33.34
tranches, and a 33 USDC claim over the third video. The reviewer was Dana
Whitfield.

The current canonical demo uses **Northstar Creators** and **Maya Santos**, a
**300 USDC** payout (three videos × 100 USDC), a **100 USDC** claim, a **72-hour
response window**, and a **partial platform claim upheld**. These names and
amounts are the single source of truth across the docs, UI constants, and demo
copy (see `README.md`).

## Where the legacy mechanics still live (for reference)

The escrow/refund/debt mechanics are unchanged in the contract code and its
documentation, and are intentionally retained there:

- `contracts/refund-protocol/README.md` — the contract-level audit + design notes.
- `contracts/refund-protocol/script/PayTranches.s.sol` — the tranche pay script.
- `contracts/refund-protocol/test/*` — Foundry tests including `DebtPath.t.sol`.
- `scripts/deploy-arc.sh` — faucet-sized demo reserve/tranche defaults.
- `docs/TECHNICAL_PRD.md` — the full as-built engineering spec (now carries an
  MVP-positioning banner at the top pointing back to `docs/scope/mvp-scope.md`).

These describe the rail. They are out of the MVP's product-claim scope.
