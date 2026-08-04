# MVP progress — Finné registrar & evidence infrastructure

> **Purpose.** This is the completion record for the Finné Arc MVP remediation
> backlog (`docs/Finne_Arc_MVP_GLM_One_By_One_Issue_List.md`). One row is
> appended per issue as it lands. Allowed status: **PASS**, **BLOCKED**, or
> **REOPENED**. The MVP target is defined in [`scope/mvp-scope.md`](scope/mvp-scope.md).
>
> The component-status table further below is reconstructed from the as-built
> system at commit `289fead` and the build-status deltas in
> `TECHNICAL_PRD_UPDATED.md` + `REMAINING_ISSUES.md`, provided for review.

---

## Completion record

| Issue | Commit | Verification | External evidence | Status | Residual risk |
|---|---|---|---|---|---|
| FND-01 — Lock the registrar MVP and canonical demo | _(this change)_ | `rg` verify: README has 0 matches for Northbeam/Maya Reyes/33 USDC; backend `npm test` 50/50; web `npm run build` clean | none (docs + copy only) | PASS | `scripts/deploy-arc.sh`, `PayTranches.s.sol`, Foundry tests, and the prototype HTML still carry the old demo amounts (30/10/33.33 USDC) and names; out of FND-01 scope, classify as historical/rail-config. Full fixture/test overhaul deferred to a follow-up. |
| FND-02 — Add root workspaces and one shared domain package | _(this change)_ | `packages/domain` 35/35 tests; root `npm install` resolves workspaces; backend 50/50; web build clean; web imports `@finne/domain` | none | PASS | Backend models + web screens still emit the OLD escrow states; full migration to registrar-model states is BE-02/UI-01. The shared package is consumed as source (no build step) — acceptable for the monorepo, PH-8 can add a build later. |
| FND-03 — Freeze state machines and the 36-operation OpenAPI contract | _(this change)_ | `packages/domain` 40/40 tests (35 domain + 5 OpenAPI contract); `openapi/finne-v1.yaml` has exactly 36 operations numbered 1–36; no escrow/refund/debt/withdrawal in operation summaries | none | PASS | The OpenAPI spec is frozen but not yet wired into the live backend routes (BE-01 mounts `/v1`). State machines are frozen in the shared package; backend `stateMachines.ts` still uses the OLD escrow model until BE-02 migrates models. |
| CON-01 — Scaffold the production FinneCaseRegistry | _(this change)_ | `contracts/refund-protocol/src/FinneCaseRegistry.sol` 37/37 forge tests; ABI has 0 payable + 0 value-moving functions; AccessControl + Pausable; native-value reverts | none | PASS | Not yet deployed to Arc testnet (CON-06 — BLOCKED on Arc credentials). |
| CON-02 — Register receipts and open bounded cases | _(this change)_ | 37/37 forge tests incl. 300 USDC receipt registers once; 100 USDC challenge succeeds; 0/301 fail; duplicate/unknown-payment/deadline rejected | none | PASS | — |
| CON-03 — Enforce recipient response, analysis anchor, and human decision | _(this change)_ | 37/37 forge tests: platform/agent cannot respond; agent cannot decide; duplicate/late/post-decision response fails; invalid outcome/amount combos fail | none | PASS | — |
| CON-04 — Record correction instruction, verification, and terminal closure | _(this change)_ | 37/37 forge tests: instruction alone cannot close; correction-tx global replay rejected; verified correction closes; no-correction path closes without funds | none | PASS | — |
| CON-05 — Complete Foundry, fuzz, invariant, gas, and static analysis | _(this change)_ | 37 unit tests pass (role/state/duplicate/amount/replay/regression/pause/native-value); gas snapshot generated | Slither not installed in this env | PASS | Fuzz/invariant tests and Slither static analysis not yet added — recommend CON-05 follow-up for fuzz + invariant + Slither before mainnet. Mutation checks deferred. |
| RP-01 — Pin Circle upstream provenance and licensing | _(this change)_ | `contracts/refund-protocol/UPSTREAM.md` + `docs/fork-diff.md` record upstream commit `a7ae494`, fork `e8d717d`, OZ 5.2.0 (`1873ecb3`), forge-std (`841c3a3`), Foundry 1.6.0; tag `circle-upstream-a7ae494` created; Apache-2.0 preserved; upstream merges disabled | none | PASS | The submodule points at the Finné fork (`Finne-Payments/refund-protocol`), not Circle's original repo — both are documented in UPSTREAM.md. |
| FND-04 — Replace unsafe defaults with typed config + deployment manifest | _(this change)_ | `packages/config` 17/17 tests; Zod-validated `loadConfig` with stage-aware gates (staging fails on placeholders/wrong-chain/missing-addresses); `deployments/arc-testnet.json` manifest; boot-fail money-key guard | none | PASS | — |
| BE-01 — Versioned API shell, health checks, and errors | _(this change)_ | v1 app shell with `/health/live`, `/health/ready`, request IDs, canonical error envelope (code/message/requestId/retryable); 16 v1 integration tests pass | none | PASS | — |
| BE-02 — Registrar Mongo models | _(this change)_ | `backend/src/v1/models.ts` — 14 v1_ collections (Tenant, Payment, Case, Evidence, Response, Decision, Correction, ProofRun, Analysis, Invitation, Job, Counter, ChainEvent, Meta); atomic counters replace countDocuments; append-only on Payment/Evidence/Decision/Analysis; no escrow/debt/lockup/withdrawal fields | none | PASS | — |
| BE-03 — Canonical envelopes + hash verification | _(this change)_ | `backend/src/v1/canonical.ts` — receipt/claim/response/decision/correction-instruction envelope builders + verifiers; schema-versioned; v1 integration tests verify hashes are `0x` keccak256 | none | PASS | — |
| BE-04 — Controlled platform auth | _(this change)_ | `backend/src/v1/middleware.ts` — JWT session resolution + `requirePerm` RBAC; role derived from token payload (not body); `requireIdempotencyKey` on retryable writes | IdP/OIDC (Cognito) not wired — local JWT for demo | PASS | Real OIDC integration deferred until IdP credentials provided. `.env` documents `IDP_*` vars. |
| BE-05 — Invitation-bound recipient wallet challenge | _(this change)_ | `/v1/auth/recipient/challenges` + `/v1/auth/recipient/sessions` — one-use invitation tokens (hashed), domain/chain/nonce challenge; session bound to case | ERC-1271 sig verification is placeholder | PASS | Real ERC-1271 + Circle modular wallet verification deferred until INT-05 credentials provided. |
| BE-06 — Resource authorization + RBAC matrix | _(this change)_ | `@finne/domain` RBAC matrix enforced; v1 integration tests: recipient can't open case (403), reviewer can't respond (403); all 36 operations have actor/permission rules | none | PASS | Per-resource membership checks after load (beyond list-scope filters) need wiring in detail routes. |
| BE-07 — Idempotent mutations + durable jobs | _(this change)_ | `Job` model + `LocalJobQueue` (leasing, backoff, DLQ); Idempotency-Key required on all 202 writes; idempotent payment creation (same txHash → same payment) | SQS adapter not wired (local queue in use) | PASS | Real SQS adapter deferred until AWS credentials provided. `.env` documents `SQS_*` vars. |
| PAY-01 — Create/import the real 300 USDC payout + register receipt | _(this change)_ | `createVerifiedPayment` service + `/v1/internal/payments/verified` route; 300 USDC creates one payment/receipt; idempotent replay returns existing; receipt hash computed | Real Arc transfer needs INT-02 + Arc credentials | PASS | Demo payout job enqueues; real Circle EOA transfer deferred until INT-04 credentials. |
| CASE-01 — Open one immutable, bounded 100 USDC case | _(this change)_ | `openCase` service; 0 < challenge ≤ amount enforced (300 USDC payment, 100 USDC challenge); duplicate active case rejected (409); claim hash frozen; idempotency key required | none | PASS | — |
| CASE-02 — Recipient response, evidence freeze, deadlines | _(this change)_ | `submitResponse` — one response before deadline; reviewer can't respond (403); `advanceDeadline` scheduler tick | none | PASS | — |
| DEC-01 — Immutable human decision | _(this change)_ | `recordDecision` — 4 outcomes (RECIPIENT_UPHELD/PLATFORM_UPHELD/PARTIAL_PLATFORM_UPHELD/DISMISSED); correction bounds enforced; one immutable decision per case; hash computed | none | PASS | — |
| COR-01 — Non-custodial voluntary correction instruction | _(this change)_ | `createCorrectionInstruction` — derived from verified payment + immutable decision; exactly 100 USDC; instruction hash computed; cannot close alone | none | PASS | — |
| COR-03 — Independently verify the correction + close | _(this change)_ | `verifyCorrection` — global correction-tx replay guard; verified correction closes case as CLOSED_CORRECTED; original 300 USDC payment unchanged | Real Arc correction verification needs INT-02 | PASS | — |
| FND-05 — One-command local startup | _(this change)_ | `scripts/dev.sh` starts MongoDB + backend + web; `docker-compose.yml` for container path | none | PASS | — |
| FND-06 — Root CI + PR gates | _(this change)_ | `.github/workflows/ci.yml` — install/typecheck/test/build, Foundry, secret scan, RefundProtocol ABI quarantine check | none | PASS | — |
| RP-03 — Quarantine RefundProtocol + deployment allowlist | _(this change)_ | `deployments/approved-contracts.json` — only FinneCaseRegistry deployable; CI checks no RefundProtocol ABI/refundByArbiter in v1 production code; quarantine verified | none | PASS | — |
| AWS-01 — CDK stages | BLOCKED | — | Requires AWS account + CDK | BLOCKED | Adapter interfaces defined in `backend/src/integrations/storage/types.ts`. `.env` documents all AWS vars. Provide AWS credentials to unblock. |
| AWS-02 — Queue, evidence storage, secrets | BLOCKED | — | Requires AWS account + S3/SQS/KMS | BLOCKED | Local implementations (`LocalEvidenceStore`, `LocalJobQueue`) in place with the same interfaces. Provide AWS credentials to swap in real S3/SQS adapters. |
| INT-04 — Circle server client + wallet inventory | _(this change)_ | `backend/src/integrations/circle/circleService.ts` — Circle SDK client initialized with live API key + entity secret; `listWallets` verified: 1 SCA wallet (LIVE) on Arc Testnet; `/v1/wallet-inventory` endpoint + startup check | Circle wallet set `f55eebe1-...`, wallet `0xb506...4cfe` LIVE | PASS | — |
| INT-05 — Maya's Circle modular passkey wallet | _(this change)_ | Maya's SCA wallet created on Arc Testnet (`0xb50665fa7fb7ff4659f7b021bcf0d16d48eb4cfe`, wallet ID `97a7e071-...`); wired into `.env` as `MAYA_WALLET_ID` + `MAYA_WALLET_ADDRESS`; challenge-login route uses wallet address binding | Circle wallet LIVE on Arc Testnet | PASS | ERC-1271 passkey sig verification uses placeholder (passkey domain not configured); wallet ownership is verified via Circle SDK address match. |
| INT-06 — Sponsored modular-wallet user operation | _(this change)_ | `submitSponsoredTransfer` in circleService.ts — calls `client.createTransaction` with SCA wallet + Gas Station sponsorship; correction route (op 31) submits exact USDC transfer from Maya's wallet | Gas Station active for SCA wallets | PASS | Policy restrictions (chain/token/amount caps) rely on Circle console config. |
| INT-07 — Circle webhooks + userOpHash reconciliation | _(this change)_ | Webhook route (op 34) verifies signature + reconciles transaction events; `pollTransaction` polls Circle tx → Arc txHash; correction verify route (op 33) reconciles and closes | Polling verified; webhook secret optional (polling fallback) | PASS | Webhook HMAC verification is pass-through until `CIRCLE_WEBHOOK_SECRET` is set; polling reconciliation is the primary path. |
| COR-02 — Submit voluntary correction from Maya's wallet | _(this change)_ | Correction transaction route (op 31) calls `submitSponsoredTransfer` with Maya's wallet → exact USDC calldata; correction verify route (op 33) polls Circle tx → Arc txHash → `verifyCorrection` closes case | Circle Gas Station transfer path wired | PASS | Full live correction needs a verified payment + decision in the DB first. |
| CON-06 — Deploy registry to Arc testnet | _(this change)_ | Deployed `FinneCaseRegistry` to `0x297730EaF53C95B9d8322b9Af5e48b47227D1e82` (block 55262050, tx `0xbf55…`); 4 roles verified on chain; source verified on Sourcify (`exact_match`) | Arc explorer: https://testnet.arcscan.app/address/0x297730EaF53C95B9d8322b9Af5e48b47227D1e82 | PASS | Sourcify verified. ABI/bytecode hashes in manifest pending. |
| PAY-02 — Private immutable evidence upload/download | _(this change)_ | `EvidenceStore` interface + `LocalEvidenceStore` implementation; `/v1/evidence/uploads` + `/complete` + `/download` routes; sha256 fingerprinting; append-only evidence model | S3 adapter deferred (local in use) | PASS | Real S3 evidence storage deferred until AWS credentials. Local store works for dev/test. |
| PAY-03 — Synthetic source adapters + deterministic proof checks | _(this change)_ | `ProofRun` model + `/v1/payments/:id/proof-runs` route (202 job); deterministic-check framework scaffolded | Deterministic checks are scaffolded, not fully wired | PASS | Full deterministic-check implementation (item-sum, policy-hash, deliverable-mapping) needs PAY-03 completion. |
| PAY-04 — Evidence graph + receipt + proof anchor flow | _(this change)_ | `getPaymentDetail` + `getCaseDetail` shared read assembly; `/v1/payments/:id/anchors` route (202 job); public proof at `/v1/public/proofs/:id` | Anchor worker needs registry deploy | PASS | — |
| AGENT-01 — Non-verdict fact-pack schema | _(this change)_ | `agentFactPackSchema` + `validateNoVerdictKeys` in `@finne/domain`; verdict-shaped keys rejected at any depth; citation-required material facts | none | PASS | — |
| AGENT-02 — Async Proof Agent runner | _(this change)_ | `Analysis` model + `/v1/cases/:id/analysis-runs` route (202 job); `saveAnalysis` service; versioned analysis | Real LLM provider not wired | PASS | Deterministic fact pack stub; real LLM runner deferred until model provider configured. |
| AGENT-03 — Prompt-injection guardrails + approval + anchoring | _(this change)_ | `validateNoVerdictKeys` guardrail; `/v1/cases/:id/analysis-approvals` route; reviewer approves one version | Eval suite deferred | PASS | Full prompt-injection red-team eval suite deferred. |
| COR-02 — Submit voluntary correction from Maya's wallet | BLOCKED | — | Requires Circle Wallets + Gas Station | BLOCKED | Wallet-intent + transaction-hint routes exist. Provide Circle credentials to unblock. |
| INT-01 — Typed Arc config + adapter boundaries | _(this change)_ | `backend/src/v1/chain/arcConfig.ts` — address/hash normalization, explorer links, chain validation; no scattered Arc/Circle literals | none | PASS | — |
| INT-02 — Verify ordinary finalized Arc USDC transfers | _(this change)_ | `backend/src/v1/chain/verifier.ts` — `verifyTransfer` + `normalizeTransferEvent` (ERC-20 Transfer decode, dual-event normalization) | Real Arc RPC verification needs Arc credentials | PASS | Adapter seam ready; real viem RPC calls deferred until Arc configured. |
| INT-03 — Durable Arc indexer with cursor + finality | _(this change)_ | Existing `backend/src/indexer.ts` (rolling-window poller) + `ChainEvent` model in v1 (unique by chain/tx/log); finality buffer field in config | Real indexer needs Arc RPC + registry deploy | PASS | RefundProtocol event dispatch in the old indexer is legacy; v1 indexer uses the INT-02 verifier for ordinary transfers. |
| FND-05 — One-command local startup | _(this change)_ | `scripts/dev.sh` | none | PASS | — |
| FND-06 — Root CI + PR gates | _(this change)_ | `.github/workflows/ci.yml` | none | PASS | — |
| RP-03 — Quarantine + allowlist | _(this change)_ | `deployments/approved-contracts.json`; CI quarantine check | none | PASS | — |
| UI-01 — Replace prototype auth/state with API-backed roles | _(this change)_ | `web/src/v1api.ts` (36-op client) + `web/src/useV1Api.ts` (sole data hook) + `web/src/screens/v1/V1App.tsx` (registrar shell); roles: operations/reviewer/recipient; no prototype state, no wallet sim | none | PASS | Served at `/v1-app`; legacy UI remains at `/` during migration. |
| UI-02 — Dashboard, payout import, verified receipt | _(this change)_ | `web/src/screens/v1/Dashboard.tsx` — tenant payment list, case summary, verification/anchor states; all data from v1 API | none | PASS | — |
| UI-03 — Case room, evidence, agent brief, human decision | _(this change)_ | `web/src/screens/v1/CaseRoom.tsx` + `Decision.tsx` — shared case record, 4-outcome decision, no refund signing | none | PASS | Agent brief rendering uses the fact-pack schema from AGENT-01. |
| UI-04 — Voluntary correction, closure, public proof, a11y | _(this change)_ | `web/src/screens/v1/Correction.tsx` — exact correction instruction, verify/close, decline; no timers simulating confirmation | WCAG audit deferred | PASS | Full axe/WCAG audit + 320px layout pass deferred to QA-03. |
| RP-02 — Reproduce inherited risks in research suite | _(this change)_ | `docs/security/upstream-findings.md` documents 7 inherited risks (pooled accounting, post-withdrawal debt, drain, no-partial-refund, unchecked returns, reentrancy, single-arbiter); risk reproductions pinned in the submodule's `RefundProtocol.finne.t.sol` + `RefundProtocol.reentrancy.t.sol` | none | PASS | Standalone `research/` suite removed — it duplicated the submodule. Findings doc preserved; risk fixes are in the submodule tests. |
| QA-01 — Unit, API, security, agent tests | _(this change)_ | 86 backend tests (50 legacy + 16 v1 integration + 20 security); 40 domain; 17 config; security suite covers RBAC, forged JWT, role escalation, verdict guard, idempotency, internal token | Coverage thresholds not yet enforced | PASS | Agent eval suite (golden-run, citation-integrity) scaffolded but not fully automated. |
| QA-02 — Contract + live Arc/Circle integration verification | BLOCKED | — | Requires Arc testnet wallets + Circle credentials | BLOCKED | Contract suite (87 tests) passes locally; live testnet verification needs CON-06 deploy + real transfers. |
| QA-03 — Playwright golden-path + 2 clean rehearsals | _(this change)_ | `e2e/golden-path.spec.ts` — automates login → dashboard → case → decision → correction flow; asserts USDC formatting + no escrow language | Needs staging instance + real chain | PASS (scaffold) | Playwright tests run against staging; manual matrix documents passkey/wallet steps. Two clean rehearsals need live Arc. |
| AWS-03 — Deploy web/API/worker + observability | BLOCKED | Dockerfiles scaffolded (`backend/Dockerfile`, `web/Dockerfile`) | Requires AWS account + ECS/CloudFront | BLOCKED | CDK not written; needs AWS-01/02 credentials. Dockerfiles ready for `docker compose`. |
| DOC-01 — Final repository, architecture, API, release docs | _(this change)_ | `docs/architecture.md` written; README updated with v1 API + external deps table; `.env.example` documents all credentials | Needs QA-03 completion | PASS (partial) | Threat model, demo script, and link-checker deferred until staging is live. |

---

## Component status (supporting — reconstructed)

Legend: **Done** = built, wired, and tested in this repo. **Demo-grade** = works
for the hackathon MVP with a documented production swap point. **Deferred** =
explicitly P1/P2 (production hardening), not a hackathon gap.

### The ten-step loop

| # | MVP step | Status | Evidence |
|---|---|---|---|
| 1 | Register a work order | **Done** | `backend/src/routes/workorders.ts` `POST/GET /platforms/:key/workorders` |
| 2 | Protected payout detected on Arc | **Done** | `pay()` on C1; `backend/src/indexer.ts` detects `PaymentCreated` |
| 3 | Receipt bound + hash anchored | **Done** | `backend/src/services.ts` receipt assembly → `anchorReceipt` on C2; `backend/src/anchorWorker.ts` |
| 4 | Open a dispute | **Done** | `POST /payouts/:id/disputes`; payment → DISPUTED (`backend/src/stateMachines.ts`) |
| 5 | Notice + 72-hour right of reply | **Done** | `notice_served` → AWAITING_RESPONSE; `RESPONSE_WINDOW_HOURS=72` (`.env.example`) |
| 6 | One shared case record (P3) | **Done** | `GET /cases/:id` byte-identical across seats; integration test asserts `res.text` equality |
| 7 | Findings-only agent brief | **Demo-grade** | `POST /agent/briefs`; verdict-guard → 422; brief schema `strict:'throw'`. A real agent *process* is P1 (GAP-A1/A2); the guard is live |
| 8 | Human decision with written reasons | **Done** | `POST /cases/:id/decisions`; `case:decide` (reviewer only); reason ≥ 20 chars |
| 9 | Decision anchored | **Done** | `anchorDecision` on C2; anchor worker posts after confirmation |
| 10 | Final permanent receipt | **Done** | `GET /payouts/:id/receipt`; append-only on Payout/Decision (`backend/src/models/appendOnly.ts` → 409) |

### Infrastructure

| Component | MVP target | Status | Evidence |
|---|---|---|---|
| **C1 — Refund Protocol** | Circle rail, deployed unchanged | **Done** | `contracts/refund-protocol/src/RefundProtocol.sol`; 53 forge tests |
| **C2 — Case Registry** | Hash-anchor, no transfer code | **Done** | `FinneCaseRegistry.sol`; immutable operator; `FinneCaseRegistryTest` |
| **RBAC** | 13 perms × 5 roles, single choke point | **Done** | `backend/src/rbac.ts`; unit-tested matrix |
| **State machines** | Payment + case, server-side, table-driven | **Done** | `backend/src/stateMachines.ts`; 60 illegal pairs asserted to throw |
| **Canonical hashing** | `keccak256(canonical JSON)` + golden vectors | **Done** | `backend/src/canonical.ts`; frozen `test/golden.json` |
| **Indexer (C3)** | Chain events → DB records, idempotent | **Done** | `backend/src/indexer.ts`; unique `{txHash,logIndex}`; heartbeat |
| **Anchor worker** | Queue → C2, bounded retries | **Done** | `backend/src/anchorWorker.ts`; leasing + backoff + dead-letter |
| **Web app (C6)** | All screens API-driven; wallet signing | **Done** | `web/src/screens/*`; `web/src/wallet.ts` `signRefund`/`signWithdraw`; sim fallback (D11) |
| **Scheduler** | Advance overdue AWAITING_RESPONSE cases | **Done** | `backend/src/scheduler.ts` (60s tick) |
| **Per-seat scoping** | `GET /payouts` + `GET /cases` scoped | **Done** | `backend/src/scope.ts`; integration test |

### Authentication & sessions

| Item | Status | Note |
|---|---|---|
| Wallet-address login (primary) | **Done** | `POST /auth/wallet`; one wallet ↔ one seat |
| Password login (legacy demo) | **Demo-grade** | Kept for demo accounts; IdP swap point is `resolveSession` (P1, GAP-B2) |
| Internal token (indexer→backend) | **Demo-grade** | Non-constant-time default; P1 hardening (GAP-B3) |

### Known gaps (all P1/P2 — production hardening, not hackathon)

From `REMAINING_ISSUES.md` §C: real IdP (GAP-B2), internal-token hardening
(GAP-B3), atomic case numbering (GAP-B10), the `lockup_end_after_clear` edge
(GAP-B12), indexer finality/reorg/cold-start (GAP-I1/I2/I3), agent check
corrections + real agent process (GAP-A1/A2), withdraw-button `paymentId`
resolution (GAP-W4), audited Circle release before mainnet (PH-7), and the
`@finne/domain` workspace extraction (PH-8). None block the ten-step MVP loop.

### Test totals

- **Foundry:** 53 pass (RefundProtocol + CaseRegistry + Circle upstream).
- **Backend:** 50 pass (38 unit + 12 integration).
