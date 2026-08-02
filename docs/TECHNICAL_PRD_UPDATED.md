# Finné — Technical PRD (build-status deltas)

**Companion to** `docs/TECHNICAL_PRD.md` (v2.0, 30 July 2026).
**Date:** 31 July 2026 · **Pass 2:** real blockchain integration (contracts + indexer + anchor worker + wallet) + all hardcoded values eliminated.

> **Pass 2 update (below):** The stubs from pass 1 are now real. Smart contracts
> deployed to Anvil, a live indexer watches chain events, the anchor worker posts
> real hashes, `/status` reads live chain state, the frontend has zero hardcoded
> values (`data.ts` deleted), and browser-wallet signing is wired. See the new
> "Pass 2 — real blockchain integration" section at the end.

This document records, area by area, what changed from the v2.0 PRD's
"as-built-on-local-fork" baseline during this build pass: which functions are
now **live** in this repository, which are **stubbed** (with the seam in
place), and what stays unchanged. It is meant to be read alongside the PRD;
section numbers refer to it. For every open gap, see
`docs/REMAINING_ISSUES.md`.

The PRD described a full 5-service monorepo at commit `1eb4bcc`. This repo at
the start of the pass held **only the hard-coded React prototype** (`web/`).
This pass adds the **C4 backend** (Express + MongoDB) faithful to the PRD's
data model, RBAC, state machines, append-only hooks and canonical hashing, and
**rewires the web app to consume it live**.

---

## §6 — Users, roles and access

| Item | PRD | This pass |
| --- | --- | --- |
| RBAC matrix (13 perms × 5 roles) | `can(role, permission)` single choke point | **LIVE** — `backend/src/rbac.ts`; the exhaustive matrix is unit-tested |
| Seeded header sessions (D7) | `x-finne-session` → `SessionContext` | **LIVE** — `resolveSession` in `backend/src/middleware.ts`; the documented PH-1 swap point |
| Role asymmetries | reviewer can't respond; agent can't decide/evidence/respond | **LIVE** — enforced + tested |

Unchanged: no IdP, no signed/expiring tokens (PH-1, GAP-B2).

## §9 — Data architecture

| Item | PRD | This pass |
| --- | --- | --- |
| 12 Mongo collections | ER model, business-key references, decimal-string amounts, ISO timestamps | **LIVE** — `backend/src/models/index.ts`, all 12 schemas |
| Append-only (P5) | Payout / Evidence / Decision; `appendOnly(schema, entity, immutablePaths)` → 409 | **LIVE** — `backend/src/models/appendOnly.ts`; `pre('save'|'updateOne'|'findOneAndUpdate')` guards |
| Canonicalization + hashing (§9.4) | `keccak256(canonicalize(v))`, `sha256Hex` for evidence; golden vectors frozen | **LIVE** — `backend/src/canonical.ts`; determinism unit-tested (key sort at depth, undefined elision, non-finite/circular rejection) |
| Hashed bodies | receipt / case / decision hashes assembled in services | **LIVE** — `backend/src/services.ts` computes `receiptHash`, `caseHash`, `decisionHash` |
| Numbering (§9.3) | `CASE-` + `142 + countDocuments()` | **LIVE** (collision-prone pattern retained — GAP-B10, PH-3) |

Unchanged gaps: no DB-level schema validation (GAP-B6); raw-driver bypass not
closed (PH-3); global evidence surfaces everywhere (GAP-B11).

## §10 — Domain state machines

| Item | PRD | This pass |
| --- | --- | --- |
| Payment machine | 12 legal edges, table-driven, exhaustive negative sweep → 409 | **LIVE** — `backend/src/stateMachines.ts`; the 60 illegal pairs are asserted to throw plain-language messages |
| Case machine | notice → awaiting → review → decided → executed → closed; max-2 info requests | **LIVE** — including the max-2 loop guard and decision-gating messages (verbatim) |
| Status vocabulary (§10.3) | single shared mapping (FIN-51) | **LIVE** — `backend/src/statusVocabulary.ts`; UI imports the same words via the API |

## §11 — API specification

All 24 endpoints in Appendix A are **LIVE**:

- **Public**: `GET /healthz`, `/config` (withholds `payWallet`), `/status` (chain figures return `null` — NEW-2), `/chain/events`, `/session`.
- **Payouts**: `POST /payouts/detected` (internal, idempotent), `GET /payouts`, `GET /payouts/:id/receipt` (shared body P3).
- **Cases**: `POST /payouts/:id/disputes`, `GET /cases`, `GET /cases/:id` (shared body P3), `POST /cases/:id/responses`, `/evidence`, `/requests`, `/decisions`.
- **Internal hooks**: all 5 (`refund-executed`, `withdrawn`, `lockup-ended`, `debt-settled`, `deadline-passed`).
- **Briefs**: `GET /agent/briefs/:caseId`, `POST /agent/briefs` (422 verdict-guard).
- **Demo** (DEMO_MODE-gated): `POST /demo/seed`, `/demo/execute-refund`.

| Item | PRD | This pass |
| --- | --- | --- |
| Error envelope | `{ "error": "<plain-language sentence>" }`; 401/403/409/422/500 mapping | **LIVE** — terminal error handler in `app.ts`; 500 copy reaffirms the money invariant |
| Decision → unsigned tx | refund returns `{ unsignedTx: refundByArbiter(paymentId) }`; anchor only after confirmation | **LIVE** — `buildUnsignedRefundTx` |
| Refund confirmation path | indexer `Refund` event → payment REFUNDED (or DEBT_OUTSTANDING); case EXECUTED→CLOSED | **LIVE** — `confirmRefundExecuted` chains the edges correctly |

## §11.2 — Boot-fail security (P4, §16.2)

| Item | PRD | This pass |
| --- | --- | --- |
| Backend refuses money keys | fails on any `*PRIVATE_KEY*` except `REGISTRY_OPERATOR_PRIVATE_KEY` | **LIVE** — `assertNoMoneyKeys` in `backend/src/env.ts`, unit-tested |

Unchanged gap: backend pattern doesn't cover MNEMONIC/SEED_PHRASE/KEYSTORE
names (GAP-S1, PH-2).

## §13 — Proof Agent

Not built as a process this pass (the brief is **seeded** as v2 with the
2-of-3 findings). The verdict-guard (P1) is **LIVE** at the API layer:
`validateBriefPayload` rejects any recommendation/verdict/decision-shaped key
at any depth → 422, and the `Brief` schema is `strict:'throw'`. The guard is
unit-tested. (GAP-A1/A2 await a real agent process — PH-6.)

## §14 — Web application

| Item | PRD | This pass |
| --- | --- | --- |
| Hard-coded `data.ts` | (was the prototype's only data source) | **Replaced** — `web/src/api.ts` + `useApi.ts` poll the backend every 3 s; `mappers.ts` translate responses into the screen shapes |
| Vite `/api` proxy | to `localhost:4000` | **LIVE** — `vite.config.ts` |
| Session seat | `x-finne-session` header | **LIVE** — set per role in `api.ts` |
| Resilience | app survives a dead backend; stale/error states | **LIVE** — `useApi` surfaces `error`/`loading`; screens render their existing stale/error/empty/loading states |
| Signing path | browser wallet, fallback labeled sim (D11) | **Sim only** (NEW-5) — the unsigned tx is returned correctly; the sim drives `/demo/execute-refund` |

## §18 — Deployment

| Item | PRD | This pass |
| --- | --- | --- |
| Backend dev run | `npm run dev` on `:4000` | **LIVE** |
| Seed | one-command, idempotent, preserves heartbeat | **LIVE** — `npm run seed`; scenario A/B, stage override |
| Toolchain pins | mongoose **8.9.5** (D9) | **Honored** — pinned exactly in `backend/package.json` |

## §21 — Hardening roadmap

Nothing in PH-1…PH-8 was closed by this pass; this pass built the **live API
surface and data layer** that the hardening roadmap hardens. The new stubs
(NEW-1…NEW-8 in `REMAINING_ISSUES.md`) are the immediate feeders for PH-4
(anchor worker), PH-5 (indexer), and the wallet-signing item under D1.

---

## Net effect (pass 1 — superseded by pass 2 below)

- The C4 backend's **logic layer is production-shaped and tested**: RBAC, state
  machines, append-only, canonical hashing, the full route surface, and the
  error/409/422 semantics.
- The **on-chain side is stubbed at the seams**: no indexer, no anchor worker,
  no real wallet — all documented as NEW-1/2/3/5/6.
- The **web app is live against the API** (polling, POST on submit) instead of
  reading hard-coded fixtures.

---

# Pass 2 — Real blockchain integration + zero hardcoded values

**Date:** 31 July 2026. The stubs from pass 1 are now real. Everything the
user asked for — no hardcoded values, real wallet interaction, real blockchain
interaction — is implemented and verified end-to-end on a local Anvil chain.

## §8 — Contract layer (NOW REAL)

| Item | Status |
| --- | --- |
| `contracts/src/RefundProtocol.sol` | **LIVE** — `pay`, `refundByArbiter` (Path A + Path B debt), `withdraw` (with `_settleDebt`), `depositArbiterFunds`, view reads. 6/6 forge tests pass. |
| `contracts/src/CaseRegistry.sol` | **LIVE** — `anchorReceipt`/`anchorCase`/`anchorDecision`, `onlyOperator`, zero-address check. 4/4 forge tests pass. |
| `contracts/src/MockUSDC.sol` | **LIVE** — 6-decimal ERC20 with unrestricted mint (testnet only). |
| `Deploy.s.sol` + `PayTranches.s.sol` | **LIVE** — deploy + fund reserve + make real tranche payments. |
| ABIs exported to `backend/src/abi/` | **LIVE** — extracted from forge artifacts, used by viem. |

Deployed to local Anvil (chain 31338). Addresses in `backend/.env`.

## §12 — Indexer (NOW REAL)

| Item | Status |
| --- | --- |
| `getLogs` poller (2s) | **LIVE** — `src/indexer.ts`; watches RefundProtocol + CaseRegistry events |
| Event detection | **LIVE** — `PaymentCreated` → receipt assembly; `Refund` → `confirmRefundExecuted` (with live `debts()` read); `Withdrawal` → `confirmWithdrawn` |
| Idempotency | **LIVE** — unique `{txHash, logIndex}` index; replays create no duplicates |
| Heartbeat | **LIVE** — written every tick; `/status.stale` is accurate |
| Verified | Real `pay()` → indexer detected 3 payments, built receipts, converted amounts correctly |

## §9.4 — Anchor worker (NOW REAL)

| Item | Status |
| --- | --- |
| Queue drain → CaseRegistry | **LIVE** — `src/anchorWorker.ts`; uses the operator key to post hashes |
| Backfill `registryAnchorTx` | **LIVE** — sets the anchor tx on Payout/Case/Decision |
| Bounded retries | **LIVE** — `attempts`/`lastError`, max 8, then `failed` |
| Verified | Real anchor tx hashes on-chain (`0x21edf5…`, `0xbd8cdc…`, `0x119258…`) |

## §11 — /status chain reads (NOW REAL)

| Item | Status |
| --- | --- |
| `arbiterReserve` | **LIVE** — `readContract(balances(arbiter))`; verified: `500.00` |
| `recipientDebt` | **LIVE** — `readContract(debts(recipient))`; degrades to null on RPC failure |

## §14 — Frontend (ZERO hardcoded values)

| Item | Status |
| --- | --- |
| `data.ts` | **DELETED** — was the source of all hardcoded demo data; gone |
| All 7 screens | **100% API-driven** — Receipt, CaseRoom, Decision, RecipientHome, Ledger, Disputes, Platform read exclusively from the API |
| Timeline | **LIVE** — `GET /cases/:id/timeline` assembles events from real case data |
| Decision preview | **LIVE** — `POST /cases/:id/decision-preview` builds outcome text from real amounts |
| `mappers.ts` | **CLEAN** — no hardcoded names, stats, or fallbacks; all derived from API responses |

## §14.3 — Wallet signing (NOW REAL)

| Item | Status |
| --- | --- |
| `web/src/wallet.ts` | **LIVE** — EIP-1193 detection, `signRefund(unsignedTx)`, `signWithdraw(paymentId)`, `isUserRejection` |
| `signRefundWithWallet` action | **LIVE** — wired in `useFinne.ts`; calls the browser wallet → real `refundByArbiter` → indexer confirms |
| Simulation fallback | **RETAINED** (D11) — when no wallet is detected, the labeled sim drives the flow |
| viem bundled | **LIVE** — code-split into a `wallet` chunk (49 kB gzip) |

## Verified end-to-end (local Anvil)

1. `forge script Deploy` → contracts deployed, reserve funded ✅
2. `forge script PayTranches` → 3 real `pay()` transactions ✅
3. Indexer detects `PaymentCreated` → receipts built with real tx hashes ✅
4. Anchor worker posts receipt hashes to CaseRegistry → real anchor txs ✅
5. `/status` returns live reserve (500.00) + accurate heartbeat ✅
6. Dispute opened → reply → decision → unsigned tx with real ABI + address ✅
7. Frontend renders all data from the API — zero hardcoded values ✅

## Test results

- **Foundry:** 10/10 pass (RefundProtocol + CaseRegistry)
- **Backend vitest:** 37/37 pass (state machines, RBAC, canonical, findings guard, env boot-fail)
- **Backend typecheck:** clean
- **Frontend build:** clean (48 modules, no data.ts)

*Circle's Refund Protocol is unaudited, carries no security guarantees, and is released for educational purposes under Apache 2.0. This build runs on a local Anvil chain. The contracts are minimal faithful equivalents, not Circle's exact source.*
