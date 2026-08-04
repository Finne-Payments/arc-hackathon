# ADR 0004 — Circle wallet roles and key custody zones

- **Status:** Accepted
- **Date:** 2026-08-04
- **Decides:** Which keys exist, who holds them, and what each can do.

## Context

If a single service held both "can move money" and "can write the record"
authority, a compromise of that service would be a compromise of funds. Finné
must be safe to operate even if its own infrastructure is fully compromised.

## Decision

**Four custody zones, strictly separated.** Money-moving keys never touch Finné
infrastructure; Finné holds exactly one key, and it cannot move USDC.

| Zone | Keys | Held by | Can do |
|---|---|---|---|
| **A — user-held** | payer, arbiter, recipient | platform treasury / reviewer's browser / recipient's browser | `pay`, `refundByArbiter`, `withdraw` — against C1 only |
| **B — Finné operational** | registry operator | backend env only | `anchorReceipt/Case/Decision` — against C2 only |
| **C — keyless services** | none | indexer, agent | read-only chain / REST only |
| **D — data plane** | none | MongoDB | stores content; never goes on chain |

The arbiter key signs `refundByArbiter` from the reviewer's *own* browser
wallet; the recipient key signs `withdraw` from theirs. The single Finné-held
operator key anchors hashes and physically cannot reach C1.

## Consequences

- The "no Finné component can move USDC" claim is the product's central security
  property, enforced at four independent layers (environment, code reachability,
  contract, process) — defence in depth.
- Backend, agent, and indexer refuse to boot if a money-moving key appears in
  their environment.
- `deploy-arc.sh` passes the operator key *only* to the backend process line;
  payer/arbiter/recipient keys stay in `contracts/.env.deploy` (gitignored).

## Enforcement

- Boot assertions: `backend/src/env.ts`, `agent/src/env.ts`, `indexer/src/env.ts`
  (patterns cover `PRIVATE_KEY`, `MNEMONIC`, `SEED_PHRASE`, `KEYSTORE`, with the
  single `REGISTRY_OPERATOR_PRIVATE_KEY` exception).
- `FinneCaseRegistry.operator` is `immutable` with no setter.
- CI `gitleaks` scans full history.
