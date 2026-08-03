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
npm run seed                  # build the demo world (idempotent)
npm run dev                   # API on http://localhost:4000
```

Health check: `curl http://localhost:4000/healthz` → `{"ok":true}`

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the API with live reload (nodemon + tsx). |
| `npm start` | Start the compiled API (tsx runtime). |
| `npm run seed` | Wipe 11 collections and rebuild the frozen demo world. Idempotent. |
| `npm test` | Run the vitest suite (state machines, RBAC, canonical, findings guard, env boot-fail). |
| `npm run typecheck` | `tsc --noEmit`. |

## Trying the demo

All read/mutate routes select a seat with the `x-finne-session` header (D7):
`reviewer`, `recipient`, `platform`, `agent`.

```bash
# shared case body (P3 — byte-identical for every seat)
curl -s localhost:4000/cases/CASE-0142 -H "x-finne-session: reviewer" | jq
curl -s localhost:4000/cases/CASE-0142 -H "x-finne-session: recipient" | jq

# reviewer decides a refund → returns an unsigned tx for the browser wallet
curl -s localhost:4000/cases/CASE-0142/decisions \
  -H "x-finne-session: reviewer" -H "content-type: application/json" \
  -d '{"outcome":"refund","reason":"Video 3 was never on file and no delivery confirmation was provided."}' | jq
```

Seed variants:

```bash
npm run seed                                 # scenario A, under review (default)
SEED_STAGE=decided npm run seed              # show the final-receipt / outcome state
SEED_STAGE=awaiting_response npm run seed    # recipient reply composer visible
```

## What's live vs stubbed

This build implements the full API surface, RBAC, state machines, append-only
hooks, canonical hashing and the frozen seed — but the on-chain side is stubbed
(see `docs/REMAINING_ISSUES.md`):

- **No indexer process** — there is no chain watcher; `/status` chain figures
  return `null` and the internal hooks are exercised by `/demo/seed` and the
  frontend's labeled simulation. The contract is identical to the PRD's.
- **No real anchor worker** — anchor jobs are enqueued but not posted to C2
  (no real registry contract). The enqueue code and job model are in place.
- **No real wallet signing** — `POST /cases/:id/decisions` returns the unsigned
  tx; the frontend's simulation flow stands in (D11). The decision + reason
  persist and the refund confirmation is driven by `/demo/execute-refund`.

These are PRD PH-5 (indexer) and PH-7 (contracts) items.

## Layout

```
src/
  server.ts        entry — boot-fail assertions, Mongo connect, listen
  app.ts           express app + terminal error handler
  env.ts           env loading + the P4 boot-fail assertions
  db.ts            mongoose connection + drop-for-seed
  rbac.ts          can(role, permission) — the single choke point
  stateMachines.ts payment + case machines, table-driven
  canonical.ts     canonical JSON + keccak256 + sha256
  findings.ts      agent brief verdict-guard (P1)
  usdc.ts          6-decimal helpers
  statusVocabulary.ts  single shared status-word mapping
  middleware.ts    resolveSession + requirePermission + requireInternal
  services.ts      receipt/case/decision assembly + hashing
  seed.ts          frozen demo fixtures → DB
  models/          12 mongoose schemas + append-only plugin
  routes/          one file per resource group (24 endpoints)
test/              vitest suites
```

## Disclaimer

Circle's Refund Protocol is unaudited, carries no security guarantees, and is
released for educational purposes under Apache 2.0. This build runs on Arc
testnet only and holds no money-moving keys.
