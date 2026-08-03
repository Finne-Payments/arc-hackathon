# Finné — Backend

Express REST API over MongoDB. The Dispute resolution system for stablecoin payouts on
Circle's Refund Protocol. This is the C4 component (PRD §7.3): receipts, work
orders, evidence, cases, responses, decisions, with server-side state machines,
an RBAC permission matrix, append-only enforcement, and canonical hashing.

## Prerequisites

- Node 20+ (developed on Node 22)
- A running MongoDB (local or Atlas)

Quick local Mongo via Docker:

```bash
docker run -d --name finne-mongo -p 27017:27017 mongo:7
```

## Quick start

```bash
cp .env.example .env          # adjust MONGO_URL if needed
npm install
npm run dev                   # API on http://localhost:4000
```

Health check: `curl http://localhost:4000/healthz` → `{"ok":true}`

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the API with live reload (nodemon + tsx). |
| `npm start` | Start the compiled API (tsx runtime). |
| `npm test` | Run the vitest suite (state machines, RBAC, canonical, findings guard, env boot-fail). |
| `npm run typecheck` | `tsc --noEmit`. |

## Data model

The database starts **empty** — there is no seed step. Payouts, cases, and users
are created dynamically from real usage: wallet sign-in creates a user, on-chain
`pay()` (detected by the indexer) creates a payout, and `POST /payouts/:id/disputes`
opens a case. All list/detail endpoints reflect whatever is in the DB.

## Trying the demo

Sign in from the web app with a connected wallet (MetaMask/Rabby on Arc testnet);
the backend find-or-creates a user keyed by the wallet address and binds it to
one seat. Money moves via the RefundProtocol contract; the indexer detects
on-chain `pay()` / `refundByArbiter()` events and builds payouts and receipts.

## Live chain integration

When chain addresses/keys are configured in `.env` (`REFUND_PROTOCOL_ADDRESS`,
`CASE_REGISTRY_ADDRESS`, `REGISTRY_OPERATOR_PRIVATE_KEY`, `ARC_RPC_URL`), the
backend runs the full on-chain loop:

- **Indexer** (`indexer.ts`) — watches the RefundProtocol + CaseRegistry for
  `PaymentCreated` / `Refund` / anchor events, and builds payouts + receipts.
- **Anchor worker** (`anchorWorker.ts`) — posts receipt/case/decision hash
  anchors to the CaseRegistry using the operator key (hashes only; never USDC).
- **Wallet signing** — refund decisions return an unsigned tx that the reviewer's
  browser wallet signs (`refundByArbiter` on the RefundProtocol).

### Chain-first invariant

A Payout row is created **only** by the indexer when it detects a real on-chain
`pay()` on the RefundProtocol — never by a direct DB write. `POST /payouts`
returns the unsigned `pay()` transaction for the browser wallet to sign; it does
not write a Payout. Until the contracts are deployed, money-mutating endpoints
(`POST /payouts`, `POST /payouts/:id/disputes`) return `503` via the
`requireChainConfigured` middleware, and `/config` reports `chainReady: false`.
Deploy with `./scripts/deploy-arc.sh` (see the repo root README).

With no chain configured, the indexer/anchor worker sit idle and the API serves
whatever is in the DB (chain figures in `/status` and `/wallet/balance` degrade
to `null`).

## Layout

```
src/
  server.ts        entry — boot-fail assertions, Mongo connect, listen
  app.ts           express app + terminal error handler
  env.ts           env loading + the P4 boot-fail assertions
  db.ts            mongoose connection
  rbac.ts          can(role, permission) — the single choke point
  stateMachines.ts payment + case machines, table-driven
  canonical.ts     canonical JSON + keccak256 + sha256
  findings.ts      agent brief verdict-guard (P1)
  usdc.ts          6-decimal helpers
  statusVocabulary.ts  single shared status-word mapping
  middleware.ts    resolveSession + requirePermission + requireInternal
  services.ts      receipt/case/decision assembly + hashing
  models/          mongoose schemas + append-only plugin
  routes/          one file per resource group
test/              vitest suites
```

## Disclaimer

Circle's Refund Protocol is unaudited, carries no security guarantees, and is
released for educational purposes under Apache 2.0. This build runs on Arc
testnet only and holds no money-moving keys.
