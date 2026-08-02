# Finné — Remaining Issues

Open gaps after the real-blockchain-integration pass **and** the gap-closure pass.
All hackathon-appropriate PRD gaps are now resolved. What remains is genuine
production hardening (PRD PH-1…PH-8) that was explicitly out of scope for the
hackathon build.

> Built against `docs/TECHNICAL_PRD.md` (v2.0).

---

## A. Previously-stubbed items — RESOLVED

| Old ID | Was | Now |
| --- | --- | --- |
| NEW-1 | No anchor worker | **RESOLVED** — `src/anchorWorker.ts` drains the queue, posts hashes on-chain, and now has **job leasing + exponential backoff + logged dead-letter** (GAP-B5) |
| NEW-2 | `/status` chain figures returned null | **RESOLVED** — real viem view reads (`balances`, `debts`) |
| NEW-3 | No indexer process | **RESOLVED** — `src/indexer.ts` polls `getLogs`, drives the state machines |
| NEW-4 | Synthesized heartbeat | **RESOLVED** — real indexer heartbeat; `/status.stale` accurate |
| NEW-5 | No wallet signing | **RESOLVED** — `web/src/wallet.ts` `signRefund`/`signWithdraw`; sim fallback (D11) |
| NEW-6 | No-op lockup/debt hooks | **RESOLVED** — `lockup-ended` + `debt-settled` now drive their state-machine edges; `debt-settled` fired by the indexer's Withdrawal handler |
| Hardcoded values | `data.ts` held all demo content | **RESOLVED** — `data.ts` deleted; every screen reads 100% from the API |
| No contracts | No Solidity in the repo | **RESOLVED** — `contracts/refund-protocol/` submodule (Circle's RefundProtocol, unchanged) + Finné's FinneCaseRegistry; 53 forge tests pass |

---

## B. Gap-closure pass — RESOLVED (this pass)

| ID | Where | Was | Now |
| --- | --- | --- | --- |
| GAP-B1 | backend | No per-seat data scoping; all seats saw all payouts/cases | **RESOLVED** — `src/scope.ts` scopes `GET /payouts` + `GET /cases` by the caller's wallet/platformKey; verified by integration test |
| GAP-B5 | anchorWorker | No backoff, no leasing, silent terminal `failed` | **RESOLVED** — job leasing (`findOneAndUpdate` claim), exponential backoff via `nextAttemptAt`, ERROR-logged dead-letter |
| GAP-B13 | backend | `deadline-passed` route existed; nothing called it | **RESOLVED** — `src/scheduler.ts` ticks every 60s, advances overdue AWAITING_RESPONSE cases; started from `server.ts` |
| GAP-S1 | env asserts | Backend boot-fail missed MNEMONIC/SEED_PHRASE/KEYSTORE | **RESOLVED** — regex extended; test cases added |
| GAP-S2 | backend | `DEMO_MODE` never gated `/demo/*` | **RESOLVED** — `requireDemoMode` middleware gates both demo routes (403 when off) |
| GAP-W1 | web | Status words hardcoded; duplicated | **RESOLVED** — `web/src/domain/statusVocabulary.ts` shared module; mappers import it. *(Full `@finne/domain` workspace extraction still deferred — see C.)* |
| GAP-W2 | web | Wallet passed `chain: null`; no Arc chain config | **RESOLVED** — `arcTestnet` chain defined; `ensureArcChain()` switches/adds before every signature |
| GAP-W5 | web | No URL routing / deep links; in-memory only | **RESOLVED** — `react-router-dom` BrowserRouter; screen ↔ URL synced, deep-linkable |
| — | backend | Work-order routes missing (only endpoint group absent) | **RESOLVED** — `routes/workorders.ts` `POST/GET /platforms/:key/workorders` |
| — | backend | No route/integration tests (PRD §19.2) | **RESOLVED** — `test/integration.test.ts` (12 tests): RBAC 401/403, byte-identical shared case, dispute flow, append-only 409, receipt idempotency, per-seat scoping |
| — | web | No seat switcher (asRole had no UI) | **RESOLVED** — "View as" dropdown in the sidebar |
| — | backend | Stale `x-finne-session` references after JWT swap | **RESOLVED** — comments/copy updated to reflect JWT auth |
| — | backend | `middleware.ts` dynamic `require("./env.ts")` (broke under plain node) | **RESOLVED** — static import |

**Test totals:** 50 backend tests (38 unit + 12 integration) + 53 Foundry tests, all green.

---

## C. Still open — production hardening only (PRD §21)

These are the workstreams the PRD explicitly defers to the main deployment. They
are documented for completeness, not as hackathon gaps.

| ID | Where | Finding | → Workstream |
| --- | --- | --- | --- |
| GAP-B2 | backend | Header/JWT sessions: no verified IdP (D7 by design) | PH-1 (real OIDC at the `resolveSession` swap point) |
| GAP-B3 | backend | `INTERNAL_TOKEN` default `dev-internal`, non-constant-time | PH-2 |
| GAP-B10 | services | Case numbering from `countDocuments` — collision-prone under concurrency | PH-3 (atomic counter) |
| GAP-B12 | domain/backend | `lockup_end_after_clear` edge defined but never emitted (the indexer path) | PH-5 |
| GAP-I1 | indexer | No finality buffer / reorg handling (Anvil has instant finality) | PH-5 |
| GAP-I2 | indexer | Unbounded cold-start `getLogs` | PH-5 |
| GAP-I3 | indexer | In-memory payment tracking lost on restart | PH-5 |
| GAP-A1 | agent | Check 4 compares `/config` recipient wallet with itself (shared body lacks `recipientWallet`) | PH-6 |
| GAP-A2 | agent | Deliverable↔evidence matching positional/time-sorted, not name-matched | PH-6 |
| GAP-W3 | web | `web/README.md` stale (contradicts current app) | docs pass |
| GAP-W4 | web | Withdraw button's `paymentId` still a hardcoded `"0"` stub; not resolved from the row context | PH-6 |
| — | contracts | Minimal faithful equivalents of Circle's contracts; adopt Circle's fixed early-withdrawal release before any mainnet | PH-7 (audited Circle release) |
| — | web | `@finne/domain` is a local mirror module, not a true shared workspace package; backend + web each import an identical copy that must be kept in lockstep | PH-8 (pnpm workspaces extraction) |

---

*Circle's Refund Protocol is unaudited, carries no security guarantees, and is released for educational purposes under Apache 2.0. This build runs on Arc testnet only.*
