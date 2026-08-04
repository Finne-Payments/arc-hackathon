# ADR 0006 — Sensitive data stays off chain

- **Status:** Accepted
- **Date:** 2026-08-04
- **Decides:** What goes on chain versus what stays in the database.

## Context

A dispute record contains names, amounts, evidence text, and written reasons —
potentially sensitive, and certainly not data that should be permanently public
on a verifiable ledger. At the same time, the whole point is verifiability: a
third party must be able to confirm a receipt/case/decision is authentic without
trusting Finné.

## Decision

**Only hashes, identifiers, and a 1-byte outcome ever touch the chain. Content
stays in the database.** The Case Registry anchors `keccak256` of canonical JSON
for receipts, cases, and decisions. The decision anchor carries a single outcome
byte (1 refund · 2 release · 3 no action) — the maximum semantic leakage
permitted on chain.

## Consequences

- No names, amounts, evidence, or reasons are ever on chain. Anyone with the
  off-chain content can recompute the hash and verify the anchor; the chain
  itself leaks nothing personal.
- Canonicalization is load-bearing: the same logical value must serialize to the
  same bytes in every service, or hashes diverge. Golden vectors are frozen and
  treated as an interface (any change is a breaking change to verifiability).
- The database is the content plane; the chain is the proof plane. Losing the
  DB loses content but not the proofs; the proofs still attest that *something*
  was anchored at a time.

## Enforcement

- `FinneCaseRegistry` calldata is exactly 3 hashes + 2 ids + 1 enum + 1 deadline
  across its three functions — verified by inspection.
- `backend/src/canonical.ts` implements sorted-key canonical JSON with frozen
  golden vectors (`test/golden.json`).
- `sha256Hex` fingerprints evidence payloads server-side; only the fingerprint
  surfaces in receipts/case room, never the raw `fileOrText`.
