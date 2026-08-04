# ADR 0005 — Arc testnet only

- **Status:** Accepted
- **Date:** 2026-08-04
- **Decides:** Which chain and deployment scope the MVP supports.

## Context

Circle's Refund Protocol is unaudited and released for educational purposes
under Apache 2.0. Running on real value before an audit posture exists would be
irresponsible. The hackathon also needs a single, stable target.

## Decision

**The MVP runs on Arc testnet only, against Circle's Refund Protocol as the
single rail.** Chain id `5042002`, native testnet USDC (6 decimals). No mainnet,
no multi-rail routing, no alternative chains in the MVP.

## Consequences

- All money, addresses, and balances are testnet faucet funds. No claim of live
  customers or real value.
- Mainnet deployment is gated on (a) an audited rail release from Circle and
  (b) verified deployments with address change control. Until then it is out of
  scope (`docs/scope/mvp-scope.md`, P2).
- The honesty statement ("Circle's Refund Protocol is unaudited, carries no
  security guarantees…") must appear in the README, deck, and video, and in any
  main-deployment marketing until the audit posture changes.
- `earlyWithdrawByArbiter` is kept administratively unused (upstream drain
  issue) until Circle's fixed release is adopted.

## Enforcement

- Chain wiring (`backend/src/chain/client.ts`, `web/src/wallet.ts` `arcTestnet`
  config) targets Arc testnet constants.
- `deploy-arc.sh` is the single canonical deploy path and targets the Arc RPC.
- Disclaimer is present in `README.md` and `docs/LEGACY_NARRATIVE.md`.
