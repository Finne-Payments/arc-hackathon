# Finné

**Registrar and evidence infrastructure for stablecoin payouts.** Finné sits *above* Circle's Refund Protocol, running on Arc testnet. An entry for the Encode Programmable Money Hackathon (DeFi track).

A stablecoin payment records that one wallet sent USDC to another — it does not record *why*, and there is nowhere to resolve a dispute about it. Finné is that place: it registers a payout against the work it was for, holds a shared case record both sides can read, runs deterministic checks that flag what's on file and what's missing, records a human decision in writing, and anchors every step as a verifiable hash. Finné never holds funds, never decides by machine, and never signs a transaction. It is the record, not the rail.

## The problem

Businesses and platforms pay creators, contractors and sellers in USDC. The chain records that a wallet sent 100 USDC to another wallet — it does not record *why*. When a payout is wrong, short, or challenged, there is no claim, no evidence, no hearing and no record. Platforms claw money back by silent deduction; recipients have nowhere to appeal. Every other payment rail grew a dispute layer — card networks got chargebacks, banks got recalls. Stablecoins shipped without one.

Circle's Refund Protocol is the money rail that admits the gap: it holds an ERC-20 payment with a lockup window and a fixed refund address. What it cannot answer is the only question that matters in a dispute: **should this money move back?** It has no concept of the work, the terms, the evidence, or the recipient's side. That empty seat is Finné — the layer above the rail that registers the work, hears both sides, and records the outcome.

## Principles

1. **Finné registers and explains. It never holds funds and never signs.** The Proof Agent holds no keys, submits no transactions, and renders no verdicts. Finné's servers and agent are read-only against the chain at all times.
2. **A human at the platform decides.** The platform's own reviewer reads the case, chooses the outcome, and signs any on-chain action from their own wallet. There is no automatic-decision button anywhere in the product.
3. **Both sides see the same evidence.** The case room is one shared record. No hidden fraud score, no one-sided file.
4. **Only hashes and identifiers go on chain.** Receipt, case and decision hashes are anchored in Finné's Case Registry; content (names, amounts, evidence, reasons) stays off chain. Any on-chain refund is signed by a reviewer's *own* wallet calling the Circle rail — Finné cannot redirect funds and neither can the recipient.
5. **Every payment ends with a receipt and a right of reply.** The receipt links the on-chain transfer to the work, terms, evidence and — if disputed — the decision and its reasons. Records are append-only; corrections are new records, never silent edits.

## How a case runs

```
register work order → protected payout on Arc → receipt bound + hash anchored
→ dispute opened → 72-hour right of reply → shared case record both sides see
→ agent brief (deterministic checks, no verdict) → human decision, in writing
→ decision hash anchored → final permanent receipt
```

Money never moves through Finné. If a refund is approved, the reviewer's own browser wallet signs the Circle rail transaction; Finné's role ends at recording the decision and anchoring its hash. The MVP scope and the full ten-step loop are in [`docs/scope/mvp-scope.md`](docs/scope/mvp-scope.md).

## Architecture

| Component | Purpose |
|---|---|
| **C1 · Refund Protocol** | Circle's escrow rail — the layer Finné sits *above*, deployed unchanged on Arc testnet. USDC only ever moves here. |
| **C2 · Case Registry** | Finné's own thin contract. Anchors receipt, case and decision hashes against a payment ID. Events only, no token-transfer code, minimal storage. |
| **C3 · Indexer** | Watches C1 and C2 events over the Arc RPC; converts chain events into database records and status changes. |
| **C4 · Backend + database** | Receipts, work orders, evidence, cases, responses, decisions, policies, address book. REST API + JWT auth for the web app. |
| **C5 · Proof Agent** | Deterministic checks plus evidence assembly. Runs on payment detected and on dispute opened. Holds no keys, renders no verdict. |
| **C6 · Web app** | The product screens. Reviewer signing via injected browser wallet (MetaMask / Rabby) on Arc testnet. |

**Key custody, stated once.** USDC moves only inside C1, called by user-held wallets: the platform wallet calls `pay`, and a reviewer's own wallet signs any refund. Finné holds exactly one key — the registry operator key — which can only anchor hashes to C2 and physically cannot move USDC. Backend, agent, and indexer refuse to boot if a money-moving key appears in their environment.

## Repository layout

```
arc-hackathon/
├── contracts/refund-protocol/   Foundry project (C1 + C2 + deploy scripts)
│   ├── src/
│   │   ├── RefundProtocol.sol       C1 — Circle's vendored escrow rail (unchanged)
│   │   └── FinneCaseRegistry.sol    C2 — Finné's hash-anchor contract
│   ├── script/                      Deploy.s.sol, DeployContracts.s.sol (Arc-safe), PayTranches.s.sol
│   └── test/                        53 tests: Circle's suite + finne money-path + E2E + reentrancy
├── backend/                     Express REST API over MongoDB (C4), indexer + anchor worker + scheduler
│   └── src/
│       ├── routes/               auth, payouts, cases, briefs, workorders, wallet, addressBook,
│       │                         notifications, timeline, public, internal
│       ├── indexer.ts            C3 — chain event watcher
│       ├── anchorWorker.ts       posts C2 hash anchors with the operator key
│       ├── scheduler.ts          advances cases whose response window lapsed
│       ├── rbac.ts · scope.ts    permission matrix + per-seat data scoping
│       ├── stateMachines.ts      payment + case transitions (append-only)
│       ├── canonical.ts          canonical JSON → keccak256 (receipt/case/decision fingerprints)
│       └── swagger.ts            OpenAPI UI at /api-docs
├── web/                         React + Vite SPA (C6)
│   └── src/screens/             Ledger, NewPayout, Receipt, CaseRoom, Decision, Disputes,
│                                RecipientHome, Platform, Login
├── scripts/                     deploy-arc.sh (chain deploy + reserve + demo pays), demo.sh
├── docs/                        scope/, adr/, mvp-progress.md, LEGACY_NARRATIVE.md,
│                                TECHNICAL_PRD.md, REMAINING_ISSUES.md
├── project/                     interactive HTML prototype (no build step)
├── docker-compose.yml           backend + web (MongoDB stays external via MONGO_URL)
└── .env.example                 Docker deployment env
```

## Tech stack

- **Contracts** — Solidity ^0.8.24, Foundry (forge), OpenZeppelin (EIP-712, IERC20). Audited set is Circle's; Finné's additions harden the drain + reentrancy paths (see `contracts/refund-protocol/README.md`).
- **Backend** — Node 20+ / TypeScript, Express 4, MongoDB (Mongoose 8), JWT (`jsonwebtoken` + `bcryptjs`), Viem (read-only chain client + anchor worker). Runs via `tsx` (no compile step).
- **Web** — React 18, Vite 5, React Router, Viem (browser wallet). No UI framework — inline styles matching the prototype.
- **Chain** — Arc testnet (chain id `5042002`), native USDC (6 decimals, `0x3600…0000`).

## Getting started

The database starts **empty** — there is no seed step. The monorepo resolves all packages with one `npm install` at the root.

### Option A — One-command local dev (FND-05)

```bash
npm install               # resolves backend + web + packages/*
./scripts/dev.sh          # starts MongoDB + backend (:4000) + web (:5173)
```

All services run against local implementations — **no AWS/Circle/Arc credentials needed** for the core product loop. The v1 API (`/v1/*`) works end-to-end with local adapters (in-memory evidence store + job queue).

### Option B — Docker

```bash
cp .env.example .env            # fill in MONGO_URL (+ contract addresses + operator key)
docker compose up --build       # web on :5173, backend on :4000
```

The web container (nginx) proxies `/api/*` → the `backend` container. Health check: `curl http://localhost:4000/healthz` → `{"ok":true}`. API docs at `http://localhost:4000/api-docs`.

### Option B — host dev

```bash
# backend
cd backend && cp .env.example .env && npm install && npm run dev    # :4000

# web (separate shell)
cd web && npm install && npm run dev                                # :5173, proxies /api → :4000
```

Open `http://localhost:5173`, pick a role, and connect a wallet (MetaMask/Rabby on Arc testnet).

> Without the chain configured (`REFUND_PROTOCOL_ADDRESS`, `CASE_REGISTRY_ADDRESS`, `REGISTRY_OPERATOR_PRIVATE_KEY`), the backend still boots: payouts/disputes work off-chain, and chain figures (`/status`, `/wallet/balance`) degrade to `null`. To run the full money path, deploy the contracts next.

## Deploying contracts (chain-first)

The app is **inert on the money side** until both contracts are deployed to Arc testnet: on-chain payouts/disputes need a real `pay()` to back them. The chain is the source of truth; the database is a projection of it.

```bash
# 1. Create the deploy-only env (gitignored; holds money-moving keys ONLY).
cp contracts/.env.deploy.example contracts/.env.deploy   # then edit

# 2. Fund the accounts at https://faucet.circle.com/ (Arc testnet).

# 3. Deploy + configure the arbiter reserve + make demo payouts.
./scripts/deploy-arc.sh
```

`deploy-arc.sh` deploys `RefundProtocol` (C1) and `FinneCaseRegistry` (C2), deposits the arbiter reserve, makes real `pay()` calls, then writes the deployed addresses + the **single** registry operator key into `backend/.env` and the root `.env`. The money-moving keys (deployer / arbiter / payer) never leave `contracts/.env.deploy`; the running backend holds only the operator key, which can anchor hashes and cannot move USDC — enforced by the boot-fail guard in `backend/src/env.ts`.

> **Note on Arc testnet + forge:** Arc's native USDC invokes an `isBlocklisted` compliance precompile (`0x1800…0001`) that forge's local EVM simulator cannot execute. Any forge script that moves USDC therefore reverts in simulation and forge refuses to broadcast. `deploy-arc.sh` works around this by deploying the contracts with `forge script` (no USDC path — see `DeployContracts.s.sol`) and doing every USDC-touching step (`setLockupSeconds`, `approve`, `depositArbiterFunds`, `pay`) via `cast send` against the live chain, where the precompile exists.

## Key surface

- **v1 REST API** — 36 operations under `/v1/*` (see [`openapi/finne-v1.yaml`](openapi/finne-v1.yaml)). Includes payment import/verify, case open/respond/decide, correction instruction/verify, evidence upload/download, analysis run/approve, and public proofs.
- **Legacy API** — the original routes (`/payouts`, `/cases`, `/auth/wallet`) remain for backward compatibility during the migration.
- **Receipt** — every receipt/case/decision hash is `keccak256` of canonical JSON, verifiable forever.

## Tests

```
npm run test --workspaces     # runs all workspace tests
```

- **Domain** (`packages/domain`): 40 tests — state machines, RBAC, USDC helpers, OpenAPI contract, verdict guard.
- **Config** (`packages/config`): 17 tests — env validation, production gates, money-key guard.
- **Backend**: 66 tests — 50 legacy + 16 v1 integration (full registrar product loop).
- **Contracts** (`contracts/refund-protocol`): 87 forge tests — 37 FinneCaseRegistry + 36 Circle upstream + 13 Finné hardening + 1 reentrancy.

## External dependencies (credentials to provide later)

The product loop works end-to-end with local adapter implementations. The following credentials unlock production integrations — all documented in [`.env.example`](.env.example):

| Dependency | Env vars | What it unlocks | Status |
|---|---|---|---|
| **Arc testnet wallets** | `ARC_USDC_ADDRESS`, `CASE_REGISTRY_ADDRESS`, role wallets | Real USDC transfers, contract deployment, chain verification | BLOCKED — provide faucet-funded wallets |
| **Circle API** | `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_SET_ID` | Server client, modular wallets, Gas Station | BLOCKED — provide Circle credentials |
| **AWS** | `EVIDENCE_BUCKET`, `KMS_KEY_ID`, `SQS_QUEUE_URL` | S3 evidence storage, SQS job queue, KMS encryption | BLOCKED — provide AWS credentials |
| **IdP/OIDC** | `IDP_ISSUER`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET` | Cognito/OIDC for operations + reviewer auth | BLOCKED — provide IdP config |

Until these are provided, the local implementations (`LocalEvidenceStore`, `LocalJobQueue`, JWT auth) provide the same interfaces for development and testing.

## Demo scenario

**Northstar Creators** pays **Maya Santos** **300 USDC** for three product videos at 100 USDC each. Two arrive; the third is contested. Northstar opens a case for **100 USDC**, Maya replies with her side and evidence within the **72-hour response window**, the agent's brief flags what is on file and what is missing, and a named reviewer decides — with written reasons both sides can read — upholding a **partial platform claim**. The final receipt carries the decision, the decider, the reasons and the chain anchors, permanently.

The interactive prototype lives at `project/Finne Dispute resolution system.dc.html` (open in a browser, no build step); `project/_ds/` holds its design tokens.

## Project decisions & status

- **MVP scope** — [`docs/scope/mvp-scope.md`](docs/scope/mvp-scope.md): the ten-step target loop and P0/P1/P2 exclusions.
- **Architecture decisions** — [`docs/adr/`](docs/adr/): non-custodial registry, human-only decisions, separate voluntary correction, key custody zones, Arc-only scope, off-chain sensitive data.
- **Progress** — [`docs/mvp-progress.md`](docs/mvp-progress.md): component-by-component status.
- **Engineering spec** — [`docs/TECHNICAL_PRD.md`](docs/TECHNICAL_PRD.md): the full as-built system.

## Legacy

Earlier versions of this project described Finné as an escrow/dispute-resolution system and treated Circle's refund, debt, and future-payout mechanics as core product features. Those capabilities belong to the rail, not to Finné. The earlier narrative is preserved for historical context in [`docs/LEGACY_NARRATIVE.md`](docs/LEGACY_NARRATIVE.md); it is not a supported claim of the current MVP.

## Disclaimer

Circle's Refund Protocol is unaudited, carries no security guarantees, and is released for educational purposes under Apache 2.0. This build runs on Arc testnet only.

## Team

Arko Ganguli · Abhishek Sira Chandrashekar
