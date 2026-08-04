# Fork diff — Finné's Refund Protocol fork vs Circle upstream

> Documents the reviewed changes Finné made to Circle's `refund-protocol` (commit
> `a7ae494`) in the fork at `github.com/Finne-Payments/refund-protocol` (commit
> `e8d717d`). Automatic upstream merges are disabled; every cherry-pick is
> recorded here.

## Reviewed changes in the fork

The fork lives at `contracts/refund-protocol/` (a git submodule). Three
categories of change were reviewed:

### 1. Security hardening of `RefundProtocol.sol`

Documented in `contracts/refund-protocol/README.md` → "What changed in this fork":

- **`earlyWithdrawByArbiter` drain (high).** Cumulative withdrawals now bounded
  at `payment.amount`, not re-readable per fresh salt. Pinned by
  `testEarlyWithdrawCannotDrainBeyondPaymentAmount` +
  `testEarlyWithdrawPartialThenExcessReverts`.
- **`_executeRefund` reentrancy (medium).** The `refunded` flag is now set
  *before* `fiatToken.transfer` (checks-effects-interactions). Pinned by
  `testRefundCannotBeReenteredViaTokenHook`.
- **`pay()` input validation (low).** Added `ZeroAmount` / `ZeroRecipient`
  reverts. Pinned by `testPayRejectsZeroAmount` etc.

### 2. Finné's own contract — `FinneCaseRegistry.sol`

Finné's hash-anchor registry. In the fork this was originally a thin event-only
contract; it has been rebuilt as the production registrar
`contracts/refund-protocol/src/FinneCaseRegistry.sol` with AccessControl +
Pausable + full lifecycle enforcement (CON-01–CON-04). The old thin version is
superseded; the production version is the sole Finné contract going forward.

### 3. Scripts

- `DeployContracts.s.sol` — Arc-safe deploy (no USDC path in the forge script;
  USDC steps done via `cast send` in `scripts/deploy-arc.sh`).
- `PayTranches.s.sol` — env-driven tranche payments for the old demo.

## What was NOT changed

- Circle's Apache-2.0 license and SPDX headers — preserved verbatim.
- The EIP-712 domain semantics (Finné deploys with its own domain; this is
  configuration, not a source change).
- The core escrow/refund/withdraw mechanics of `RefundProtocol.sol` (only
  hardened, not redesigned).

## Status in the MVP

The `contracts/refund-protocol/` submodule contains both the legacy
`RefundProtocol.sol` (research/reference) and the production
`FinneCaseRegistry.sol` (the sole Finné contract). The production registry:

- Has **no token-transfer code** and no reference to RefundProtocol.
- Only registers receipt/case/decision hashes and enforces the dispute lifecycle.
- Holds no funds (all functions non-payable; native-value reverts).

See `docs/adr/0001-non-custodial-registry.md` and `docs/LEGACY_NARRATIVE.md`.

## Upstream merge policy

- **Automatic upstream merges: disabled.**
- Any future cherry-pick from Circle's upstream must be:
  1. Reviewed for safety against the known inherited risks (pooled accounting,
     early-withdrawal drain).
  2. Recorded as a new entry in this file.
  3. Re-verified by the full Foundry suite.
