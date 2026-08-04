# Upstream security findings — Circle RefundProtocol (RP-02)

> **RESEARCH ONLY.** This document reproduces and explains the known inherited
> risks in Circle's RefundProtocol. Finné's production contract
> (`FinneCaseRegistry`) avoids all of them by design: it has no token-transfer
> code, no escrow, no pooled accounting, no debt.
>
> The risk reproductions are documented in `contracts/refund-protocol/test/` —
> the Finné hardening tests (`RefundProtocol.finne.t.sol`, `RefundProtocol.reentrancy.t.sol`)
> pin the fixes for the drain, reentrancy, and input-validation issues.
> The vendored Circle source lives at `contracts/refund-protocol/src/RefundProtocol.sol`.

---

## Summary

| # | Risk | Severity | Finné fork fix | Research test |
|---|------|----------|---------------|---------------|
| 1 | Pooled accounting — shared balance across payments | High | N/A — Finné never uses RefundProtocol | `test_RISK_pooledAccounting_twoPaymentsShareBalance` |
| 2 | Post-withdrawal refund records shared debt | High | N/A — no debt in Finné | `test_RISK_postWithdrawalRefund_RecordsDebtOnSharedBalance` |
| 3 | `earlyWithdrawByArbiter` drain via fresh salt | High | Cumulative withdrawals bounded at `payment.amount` | `test_RISK_earlyWithdrawDrain_arbiterCanDrainPooledBalance` |
| 4 | No partial refund — always full amount | Medium (design) | N/A — Finné registrar has no refund | `test_RISK_noPartialRefund_alwaysFullAmount` |
| 5 | Unchecked ERC-20 return values | Low | Documented; USDC returns bool so not live | `test_RISK_uncheckedReturnValues_documented` |
| 6 | `_executeRefund` reentrancy (CEI violation) | Medium | Flag set before transfer | `test_RISK_reentrancyInExecuteRefund_documented` |
| 7 | Single arbiter, no pause/rotation/multi-sig | Medium | AccessControl with separate roles | `test_RISK_singleArbiter_noCircuitBreaker` |

---

## Detailed findings

### 1. Pooled accounting (High)

**What:** `balances[recipient]` is a single shared pool across all of a recipient's
payments. A refund or debt on payment A directly reduces the balance available
for payment B, even though B was never touched.

**Reproduction:** Two payments of 100 + 200 USDC to the same recipient show
`balances(recipient) == 300`. Refunding payment 1 drops it to 200 — payment 2's
escrow is affected despite being untouched.

**Why it matters:** A dispute over one deliverable can silently drain funds
earmarked for a different engagement. The tranche rule (one `pay()` per
deliverable) is a workaround, not a fix — the pool is still shared per
recipient address.

**Finné's position:** The production `FinneCaseRegistry` has no `balances`
mapping, no escrow, and no token-transfer code. This risk class is structurally
impossible in Finné's contract.

### 2. Post-withdrawal refund + debt (High)

**What:** If the recipient withdraws before a refund, `refundByArbiter` draws
from the arbiter reserve and records `debts[recipient] += amount`. This debt is
settled silently from the recipient's *next* payout — a future-payment deduction
the recipient may not expect.

**Reproduction:** Pay 100 → recipient withdraws → `balances == 0`. Arbiter refunds
→ `debts(recipient) == 100`.

**Finné's position:** No debt, no reserve, no forced deduction. The only money
that moves after a decision is a separate, recipient-authorized voluntary
correction (COR-01).

### 3. `earlyWithdrawByArbiter` drain (High)

**What:** With a fresh `salt` per call (defeating the replay guard), the arbiter
can call `earlyWithdrawByArbiter` repeatedly, each time pulling `payment.amount`
from the recipient's pooled balance.

**Finné fork fix:** Bounds cumulative withdrawals at `payment.amount`. Pinned by
`testEarlyWithdrawCannotDrainBeyondPaymentAmount`.

### 4. No partial refund (Medium — design)

**What:** `_executeRefund` always transfers the *full* original `payment.amount`.
There is no partial refund. This forces the tranche strategy (multiple small
`pay()` calls) and means any dispute resolution must refund a whole payment.

**Finné's position:** The registrar model has no refund. The correction is a
separate, exact-amount transfer authorized by the recipient.

### 5. Unchecked ERC-20 return values (Low)

**What:** Seven `transfer`/`transferFrom` calls do not check the `bool` return.
Real USDC returns `bool` so this is not a live bug, but non-standard tokens
(USDT-style that return `void`) would silently fail.

**Status:** Documented; using `SafeERC20` is the standard hardening if a
non-conforming token is ever used. Not relevant to Finné (no transfers).

### 6. `_executeRefund` reentrancy (Medium)

**What:** The `refunded` flag was set *after* `fiatToken.transfer`, violating
checks-effects-interactions. With a hook-capable token (ERC-777) and a recipient
contract that is also the `refundTo`, the transfer callback could re-enter
`refundByRecipient` and pay twice.

**Finné fork fix:** The flag is set *before* the transfer. Pinned by
`testRefundCannotBeReenteredViaTokenHook`.

### 7. Single arbiter, no circuit breaker (Medium)

**What:** One arbiter address, constructor-set, no setter, no pause, no
Ownable, no upgradeability, no multi-sig. A compromised arbiter key can refund
any payment. There is no way to freeze or rotate without redeploying.

**Finné's position:** `FinneCaseRegistry` uses OpenZeppelin `AccessControl` with
four separate roles (`DEFAULT_ADMIN_ROLE`, `PLATFORM_ROLE`, `REVIEWER_ROLE`,
`AGENT_ROLE`) plus `Pausable`. Key rotation and role revocation are built-in.

---

## What this is NOT

- This is **not** a professional audit.
- This is **not** a complete enumeration of all possible vulnerabilities.
- Passing these reproduction tests does **not** mean the contract is safe.
- The Finné fork's hardening (drain fix, reentrancy fix, input validation) is
  verified by the production Foundry suite (`contracts/refund-protocol`), not
  here.
- Finné's production contract (`FinneCaseRegistry`) avoids these risks
  structurally — it has no value-moving code at all.

Circle's RefundProtocol is unaudited, carries no security guarantees, and is
released for educational purposes under Apache 2.0.
