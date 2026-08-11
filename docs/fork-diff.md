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
- **`refundByArbiterWithSig` — signature-based refund (feature).** A new
  EIP-712 refund path that decouples the authorizer from the submitter. The
  arbiter signs a `RefundAuthorization(uint256 paymentID, uint256 expiry,
  uint256 salt)` typed-data message off-chain; ANY account may then submit
  `refundByArbiterWithSig` (the backend relayer does this with the operator
  key). This fixes the arbiter-wallet coupling: the reviewer no longer needs to
  hold the `onlyArbiter` key in MetaMask, and the off-chain decision records
  immediately (independent of the signature step). Mirrors the existing
  `earlyWithdrawByArbiter` pattern (same `withdrawalHashes` replay guard). The
  original `refundByArbiter` is unchanged (backward compat). Also adds
  `setArbiter(address)` so the arbiter address can be rotated without
  redeploying — rotating the arbiter invalidates all outstanding (unsubmitted)
  refund authorizations, since they no longer recover to the current arbiter.
  Pinned by `testRefundByArbiterWithSig_HappyPath_AnySubmitter`,
  `_RevertsOnWrongSigner`, `_RevertsOnReplay`, `_RevertsOnExpiry`,
  `_RevertsOnMalformedSignature`, `_PathB_RecordsDebt`, and
  `testSetArbiter_RotatesAndOnlyCurrentCanCall`.
- **Constructor + signature hardening (low).** The constructor now reverts on a
  zero arbiter address (`ZeroArbiter`), and `refundByArbiterWithSig` explicitly
  guards against `ecrecover` returning `address(0)` for malformed signatures.
  Pinned by `testConstructor_RevertsOnZeroArbiter` +
  `testRefundByArbiterWithSig_RevertsOnMalformedSignature`.

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
