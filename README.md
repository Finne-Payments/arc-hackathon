# Finné

**The Dispute resolution system for stablecoin payouts.** Built on Circle's Refund Protocol, running on Arc testnet. An entry for the Encode Programmable Money Hackathon (DeFi track).

Circle built the mechanism that *can* refund a stablecoin payment. Finné determines whether it *should* be refunded, shows why, hears both sides, and records the outcome: one protected payout, one dispute, one human decision, one on-chain correction, one permanent receipt.

## The problem

Businesses and platforms pay creators, contractors and sellers in USDC. The chain records that a wallet sent 100 USDC to another wallet — it does not record *why*. When a payout is wrong, short, or challenged, there is no claim, no evidence, no hearing and no record. Platforms claw money back by silent deduction; recipients have nowhere to appeal. Every other payment rail grew a Dispute resolution system — card networks got chargebacks, banks got recalls. Stablecoins shipped without one.

Circle's Refund Protocol is the rail that admits the gap. It escrows an ERC-20 payment, fixes a refund address at payment time, and gives a named arbiter three narrow powers: hold funds for a lockup period, refund to the pre-set address, and permit early withdrawal for an agreed fee. What it cannot answer is the only question that matters in a dispute: **should this money move back?** It has no concept of the work, the terms, the evidence, or the recipient's side. That empty seat is Finné.

## Principles

1. **The agent reads and explains. It never decides and never signs.** The Proof Agent holds no keys, submits no transactions, and renders no verdicts. Its output is a brief, not a judgement.
2. **A human at the platform decides.** The platform's own reviewer reads the case, chooses the outcome, and signs the on-chain action from the arbiter wallet. There is no automatic-decision button anywhere in the product.
3. **Both sides see the same evidence.** The case room is one shared record. No hidden fraud score, no one-sided file.
4. **Money moves only through Circle's contract, only to pre-set addresses.** Refunds execute through `refundByArbiter`, which can pay only the refund address fixed when the payment was made. Finné cannot redirect funds and neither can the reviewer.
5. **Every payment ends with a receipt and a right of reply.** The receipt links the on-chain transfer to the work, terms, evidence and — if disputed — the decision and its reasons. Only hashes and identifiers go on chain; content stays off chain.

## How a dispute runs

```
pay (escrowed on Arc) → payout receipt → dispute opened → right of reply
→ agent brief (deterministic checks, no verdict) → human decision with written reasons
→ refundByArbiter / release → final receipt, hash-anchored on Arc
```

If the lockup has already expired and the recipient has withdrawn, an approved refund draws on the arbiter reserve and the contract records a debt against the recipient, repaid automatically from their next payout — voluntary refund, small reserve, next payment: all three correction legs, native to the contract.

## Architecture

| Component | Purpose |
|---|---|
| **C1 · Refund Protocol** | Escrow, refund, withdrawal, debt. Circle's contract deployed unchanged on Arc testnet. |
| **C2 · Case Registry** | Finné's own thin contract. Anchors receipt, case and decision hashes against a payment ID. Events only, minimal storage. |
| **C3 · Indexer** | Watches C1 and C2 events over the Arc RPC; converts chain events into database records and status changes. |
| **C4 · Backend + database** | Receipts, work orders, evidence, cases, responses, decisions, policies, address book. REST API + JWT auth for the web app. |
| **C5 · Proof Agent** | Deterministic checks plus evidence assembly. Runs on payment detected and on dispute opened. Holds no keys. |
| **C6 · Web app** | The product screens. Reviewer signing via injected browser wallet (MetaMask / Rabby) on Arc testnet. |

**Money path, stated once.** USDC moves in exactly two ways: the platform wallet calls `pay`, and the reviewer's arbiter wallet calls `refundByArbiter` (or the recipient calls `withdraw` after lockup). Finné's servers and agent are read-only against the chain at all times.

## Repository layout

```
arc-hackathon/
├── contracts/refund-protocol/   Foundry project (C1 + C2 + deploy scripts)
│   ├── src/
│   │   ├── RefundProtocol.sol       C1 — Circle's vendored escrow (unchanged)
│   │   └── FinneCaseRegistry.sol    C2 — Finné's hash-anchor contract
│   ├── script/                      Deploy.s.sol, DeployContracts.s.sol (Arc-safe), PayTranches.s.sol
│   └── test/                        65 tests: Circle's suite + finne money-path + E2E + reentrancy
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
├── docs/                        TECHNICAL_PRD.md, REMAINING_ISSUES.md
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

The database starts **empty** — there is no seed step. Users are created on first wallet sign-in (one wallet is bound to exactly one seat: arbiter / merchant / customer / platform). Payouts come from a real on-chain `pay()` (detected by the indexer) or the direct `POST /payouts` create; disputes are opened from a payout.

### Option A — Docker (recommended)

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

The app is **inert on the money side** until both contracts are deployed to Arc testnet: on-chain payouts/disputes need a real `pay()` / `refundByArbiter` to back them. The chain is the source of truth; the database is a projection of it.

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

- **REST API** — `POST /auth/wallet` (wallet sign-in), `GET /payouts`, `POST /payouts` (off-chain create), `GET /payouts/:id/receipt`, `POST /payouts/:id/disputes`, `GET/POST /cases…`, `GET /wallet/balance`, `GET/POST/DELETE /address-book`. Full OpenAPI at `/api-docs`.
- **Receipt** — every tx/address is explorer-linked (`https://testnet.arcscan.app/tx/…`, `/address/…`); status is derived from the real payout, never hardcoded.
- **Per-user address book** — saved "from" (treasury) and "to" (recipient) wallets for the New Payout flow, stored in the database.
- **Search** — the header search filters payments, cases, and addresses live.

## Tests

- Contracts: `cd contracts/refund-protocol && forge test` — **65 tests** (Circle's C1 suite + Finné money-path + end-to-end C1↔C2 dispute flow + drain/reentrancy regressions).
- Backend: `cd backend && npm test` — **50 tests** (state machines, RBAC, canonical hashing, append-only, findings guard, integration, env boot-fail).

## Demo scenario

Northbeam Studios pays Maya Reyes 100 USDC for three product videos. Two arrive; the third is contested. Northbeam opens a case for 33 USDC, Maya replies with her side and evidence, the agent's brief flags what is on file and what is missing, and a named reviewer decides — with written reasons both sides can read — before signing the refund from the arbiter wallet. The final receipt carries the decision, the decider, the reasons and the chain anchors, permanently.

The interactive prototype lives at `project/Finne Dispute resolution system.dc.html` (open in a browser, no build step); `project/_ds/` holds its design tokens.

## Disclaimer

Circle's Refund Protocol is unaudited, carries no security guarantees, and is released for educational purposes under Apache 2.0. This build runs on Arc testnet only.

## Team

Arko Ganguli · Abhishek Sira Chandrashekar
