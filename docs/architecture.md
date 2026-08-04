# Finné — Architecture (DOC-01)

> Registrar and evidence infrastructure for stablecoin payouts on Arc testnet.

## System overview

```
                    ┌─────────────┐
                    │   Web app   │  React + Vite, served at /
                    │  (C6 · v1)  │  v1 registrar UI at /v1-app
                    └──────┬──────┘
                           │ REST /v1/*
                    ┌──────▼──────┐
                    │  Backend    │  Express + MongoDB (C4)
                    │  (v1 API)   │  36 operations, RBAC, state machines
                    └──┬───┬───┬──┘
           ┌───────────┘   │   └───────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │  Indexer    │ │ Anchor wrkr │ │  Scheduler  │
    │  (C3 · v1)  │ │ (hash→C2)   │ │ (deadlines) │
    └──────┬──────┘ └──────┬──────┘ └─────────────┘
           │               │
    ┌──────▼───────────────▼──────┐
    │     Arc Testnet (C1/C2)     │
    │  RefundProtocol (legacy)    │
    │  FinneCaseRegistry (prod)   │
    └─────────────────────────────┘
```

## Components

| Component | Purpose | Tech |
|-----------|---------|------|
| **C2 · FinneCaseRegistry** | The sole Finné contract. Registers receipt/case/decision hashes, enforces the dispute lifecycle. Non-custodial (0 payable functions). | Solidity 0.8.24, OpenZeppelin AccessControl + Pausable |
| **C4 · Backend** | REST API (36 ops), RBAC, state machines, canonical hashing, job queue, indexer, scheduler | Node 22, Express 4, MongoDB, Viem |
| **C5 · Proof Agent** | Deterministic checks + non-verdict fact packs | Separate process, reads via REST |
| **C6 · Web app** | Dashboard, case room, decision, correction screens | React 18, Vite 5 |
| **C3 · Indexer** | Watches Arc events, drives payment state transitions | Viem polling, cursor + finality |

## Data flow — the canonical loop

```
1. Platform pays 300 USDC on Arc (ordinary transfer)
2. Indexer detects → INT-02 verifier confirms → Payment VERIFIED
3. Receipt hash computed → human approves → anchored in C2
4. Operations opens 100 USDC case → claim hash frozen
5. Recipient gets invitation → responds with evidence
6. Reviewer reads shared record + agent fact pack → decides
7. Decision hash anchored → correction instruction created
8. Recipient authorizes separate 100 USDC correction
9. Indexer verifies correction transfer → case CLOSED_CORRECTED
10. Original 300 USDC payment remains unchanged
```

## Non-custody boundary

- **Finné contracts never hold funds.** `FinneCaseRegistry` has no token interface.
- **The original payment is final.** No reversal, no clawback, no debt.
- **Corrections are separate, recipient-authorized transfers.** Finné issues the instruction; the recipient signs from their own wallet.
- **Only hashes + IDs + amounts go on chain.** All content (allegations, evidence, reasons) stays in the database.

## Key custody zones (ADR 0004)

| Zone | Keys | Can do |
|------|------|--------|
| **User-held** | platform treasury, reviewer browser, recipient wallet | Sign Arc transactions (pay, correction) |
| **Finné operational** | registry operator (1 key) | Anchor hashes to C2 only |
| **Keyless** | indexer, agent, scheduler | Read-only chain / REST |

## Test surface

| Suite | Count | What it covers |
|-------|-------|---------------|
| Domain (`packages/domain`) | 40 | State machines, RBAC, USDC, OpenAPI contract, verdict guard |
| Config (`packages/config`) | 17 | Env validation, production gates, money-key guard |
| Backend (legacy) | 50 | Old escrow-model state machines, RBAC, canonical hashing |
| Backend (v1) | 36 | Registrar product loop integration |
| Backend (security) | 20 | Cross-tenant, role escalation, verdict guard, idempotency |
| Contracts | 87 | FinneCaseRegistry lifecycle + Circle upstream + hardening |
| Research | 7 | Inherited Circle risk reproductions |
| **Total** | **257** | |

## External dependencies

See [`.env.example`](.env.example) for the complete list. The product loop works
locally with adapter interfaces; production credentials unlock:
- **Arc testnet** — contract deployment, real transfers, chain verification
- **Circle API** — modular wallets, Gas Station, webhooks
- **AWS** — S3 evidence, SQS queue, KMS, ECS deployment
- **IdP/OIDC** — operations + reviewer authentication
