# ADR 0001 — Finné is a non-custodial registry

- **Status:** Accepted
- **Date:** 2026-08-04
- **Decides:** Finné's product boundary with respect to funds.

## Context

The stablecoin payment problem Finné addresses is one of *explanation and
record*, not custody: a chain transfer records that wallet A sent USDC to wallet
B, but not *why*, and there is no shared, auditable place to resolve a dispute
about it. Circle's Refund Protocol already provides the money rail (escrow,
refund, withdrawal). The question for Finné is where the product boundary sits:
does Finné touch money, or only the record about money?

## Decision

**Finné is registrar and evidence infrastructure, not a custodian.** Finné's own
contract (`FinneCaseRegistry`, C2) anchors `keccak256` hashes of receipts, cases,
and decisions against a payment ID. It contains **no token-transfer code and no
reference to C1 beyond an event field**. USDC only ever moves inside Circle's
Refund Protocol (C1), called by user-held wallets.

## Consequences

- The single Finné-held key is the registry operator key, which can only anchor
  hashes. It physically cannot move USDC — C2 has no transfer code and C1 does
  not know it exists. (See ADR 0004 for custody zones.)
- Backend, agent, and indexer boot-fail if a money-moving key appears in their
  environment (`backend/src/env.ts`).
- The product claim is "verifiable record," not "held funds." Marketing and the
  README must not imply custody.
- Because C2 is rail-agnostic (it anchors against any refund-protocol address),
  later adapters (Stripe, Bridge, BVNK) attach without changing the case system.

## Enforcement

- `FinneCaseRegistry.sol` has zero mutable storage beyond the immutable operator
  and no transfer functions (pinned by `FinneCaseRegistryTest`).
- Boot-fail assertions in three services; CI secret scan (`gitleaks`).
- The operator role has exactly one permission: `anchor:write`.
