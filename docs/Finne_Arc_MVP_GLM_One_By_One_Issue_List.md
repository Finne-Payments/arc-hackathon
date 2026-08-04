# Finné Arc MVP — GLM one-by-one remediation backlog

Audit basis: Finne-Payments/arc-hackathon at commit 329ef65b570b6d11310264d143694eb2c9e1e286, reviewed 4 August 2026.

Target loop:

> Finalized 300 USDC Arc payment → verified receipt → bounded 100 USDC claim → two-sided evidence → cited non-verdict Proof Agent fact pack → named human decision → separate recipient-authorized 100 USDC correction → independently verified closure.

The original payment is never reversed. Finné never holds funds, forces repayment, or lets AI make the decision.

## How to use this backlog with GLM

1. Work on exactly one issue per GLM conversation and pull request.
2. Paste the reusable prompt below, followed by one complete issue.
3. Do not start until every dependency has landed and its verification evidence exists.
4. If Arc, Circle, AWS, or credentials are unavailable, return BLOCKED. A mock cannot satisfy a live criterion.
5. Append the result to docs/mvp-progress.md after every issue.

## Reusable GLM operating prompt

> Implement only the Finné issue pasted below. First inspect the repository, its agent instructions, the named target files, and dependency evidence in docs/mvp-progress.md. If a dependency is missing, stop and answer BLOCKED with the exact missing evidence.
>
> Preserve these invariants: Finné is the registrar/evidence system, not the judge; the original payment remains final; Finné contracts never receive, approve, transfer, refund, withdraw, rescue, or authorize funds; the Proof Agent may extract and cite facts but may not recommend an outcome; only a named human reviewer decides; a correction is a new recipient-authorized transaction; sensitive case content stays offchain; financial state is confirmed from Arc RPC and decoded events, not trusted from the browser or a webhook.
>
> Make the smallest complete change. Do not implement later issues or add escrow, forced clawbacks, future-payment deductions, multichain, CCTP, Gateway, FX, reserves, automated verdicts, appeals, or real customer data. Add tests and run every verification command. Never claim a test, deployment, transaction, or browser flow passed without its output or resolvable evidence. Never commit secrets, private keys, entity secrets, raw signatures, signed URLs, or personal data.
>
> Finish with: outcome; files changed; each acceptance criterion; exact commands and results; external evidence; blockers; residual risks; excluded follow-ups.

## Completion record

FND-01 creates docs/mvp-progress.md with:

| Issue | Commit | Verification | External evidence | Status | Residual risk |
|---|---|---|---|---|---|

Allowed status: PASS, BLOCKED, or REOPENED.

## Delivery gates

| Gate | Issues | Exit condition |
|---|---|---|
| A — Scope and fork safety | FND-01–06, RP-01–03 | No production path treats RefundProtocol as the MVP |
| B — Secure app and registry | BE-01–07, CON-01–06 | Auth, tenancy, state, and non-custody tests pass |
| C — Chain rails | AWS-01–02, INT-01–07 | Real operations reconcile from Arc |
| D — Product loop | PAY-01–04, CASE-01–02, AGENT-01–03, DEC-01, COR-01–03 | Full backend loop works without UI-only state |
| E — Release proof | UI-01–04, AWS-03, QA-01–03, DOC-01 | Two clean testnet runs pass |

---

## FND-01 — Lock the registrar MVP and canonical demo

Priority: P0  
Depends on: none  
Targets: README.md; docs/TECHNICAL_PRD*.md; docs/scope/; docs/adr/; docs/mvp-progress.md

Current defect:

- README.md defines RefundProtocol escrow, arbiter refunds, debt/future-payout recovery, Northbeam/Maya Reyes, and a 100/33 USDC story.

Steps:

1. Add docs/scope/mvp-scope.md with the exact ten-step target loop and P0/P1/P2 exclusions.
2. Add ADRs for the non-custodial registry, human-only decisions, separate voluntary correction, Circle wallet roles, Arc-only scope, and offchain-sensitive-data rule.
3. Create docs/mvp-progress.md using the table above.
4. Replace current-product claims involving escrow, reversal, arbiter refund, debt, clawback, release funds, or future deduction.
5. Standardize fixtures/copy on Northstar Creators, Maya Santos, three videos at 100 USDC each, 300 USDC payout, 100 USDC claim, 72-hour response window, partial platform claim upheld.
6. Preserve the old narrative only in a clearly labeled legacy note.

Acceptance:

- The main README describes Finné as registrar/evidence infrastructure.
- No supported escrow or forced-recovery claim remains.
- Canonical names and amounts match across docs, fixtures, tests, and UI constants.
- docs/mvp-progress.md exists.

Verify:

- Run rg -n "Northbeam|Maya Reyes|33 USDC|refundByArbiter|future payout|escrowed|withdraw" README.md docs backend/src web/src and classify every remaining match as research-only or historical.

---

## FND-02 — Add root workspaces and one shared domain package

Priority: P0  
Depends on: FND-01  
Targets: root package files; backend/package.json; web/package.json; packages/domain/

Current defect:

- Backend/web are separate projects with duplicated role/status rules; web/src/useFinne.ts mirrors backend constants.

Steps:

1. Add a root private npm workspace for backend, web, packages/domain, and infra.
2. Create packages/domain exports for actor roles, payment/case/correction states/events, opaque IDs, micro-USDC helpers, and Zod schemas.
3. Migrate backend/web imports and remove duplicate status/role modules.
4. Add root install, typecheck, lint, test, build, and test:e2e scripts.
5. Pin Node 22+ and package-manager version.
6. Do not relocate backend/web in this issue.

Acceptance:

- One root install resolves all packages.
- Backend and web compile against one role/status source.
- Invalid cross-package state usage fails compilation.

Verify:

- npm ci
- npm run typecheck
- npm run build

---

## FND-03 — Freeze state machines and the 36-operation OpenAPI contract

Priority: P0  
Depends on: FND-01, FND-02  
Targets: packages/domain/; backend/src/stateMachines.ts; backend/src/statusVocabulary.ts; openapi/finne-v1.yaml

Current defect:

- Current states model ESCROWED/WITHDRAWABLE/REFUNDED/debt/withdrawal, and the old routes do not cover the required 36 operations.

Steps:

1. Define payment states: OBSERVED, VERIFIED, REJECTED, PROOF_DRAFT, ANCHORED, DISPUTED, UNDISPUTED.
2. Define case states: OPEN, RESPONDED, UNDER_REVIEW, EVIDENCE_REQUESTED, DECIDED, CORRECTION_OUTSTANDING, CLOSED_CORRECTED, CLOSED_NO_CORRECTION.
3. Define correction states: DRAFT, AWAITING_SIGNATURE, SUBMITTED, VERIFIED, MISMATCH, FAILED, DECLINED.
4. Encode exhaustive legal transitions and typed 409 failures.
5. Publish OpenAPI 3.1 for all 36 PRD operations, async jobs, idempotency headers, permissions, and structured errors.
6. Generate or validate shared request/response types from OpenAPI.
7. Add route-to-operation and state/event coverage tests.

Acceptance:

- No production state implies escrow, debt, withdrawal, or original-payment reversal.
- OpenAPI lists exactly 36 canonical operations.
- Runtime schemas cannot silently diverge from the contract.

Verify:

- Run domain tests, OpenAPI validation, and a 36/36 route-coverage report.

---

## FND-04 — Replace unsafe defaults with typed configuration and deployment manifests

Priority: P0  
Depends on: FND-02, FND-03  
Targets: backend/src/env.ts; backend/.env.example; .env.example; deployments/; packages/config/

Current defect:

- env.ts hardcodes old RefundProtocol/registry addresses and defaults to change-me, dev-internal, demo-on, and local chain values.

Steps:

1. Add Zod-validated local, test, staging, and submission configurations.
2. Separate browser-safe values from server secrets.
3. Make staging/submission fail on placeholder secrets, wrong chain, missing USDC/registry, HTTP endpoints, or any RefundProtocol config.
4. Create deployments/arc-testnet.json as the sole release manifest.
5. Record chain ID, registry address, deployment tx/block, compiler settings, git commit, ABI/bytecode hashes, role holders, and verification URL.
6. Remove hardcoded old addresses and production REFUND_PROTOCOL_ADDRESS handling.
7. Commit secret references only.

Acceptance:

- Staging cannot boot with placeholders, zero addresses, or old RefundProtocol configuration.
- Web/API/worker/scripts/tests read one manifest.
- GET /v1/meta exposes no secret.

Verify:

- Run positive/negative environment tests and a tracked-file secret scan.

---

## FND-05 — Provide one-command local startup and deterministic reset

Priority: P0  
Depends on: FND-02, FND-04  
Targets: docker-compose.yml; scripts/demo.sh; scripts/reset-demo.*; backend/src/seed/; fixtures/

Current defect:

- Current scripts deploy/use RefundProtocol and seed the old flow; seeded records can look like verified chain state.

Steps:

1. Start MongoDB/local substitute, API, worker, indexer, web, and local queue adapter with one command.
2. Seed versioned Northstar/Maya agreement, policy, three deliverables, acceptance records, and analytics.
3. Add an authenticated demo-mode reset scoped only to the synthetic tenant.
4. Label records OFFCHAIN_FIXTURE until a real imported transaction passes verification.
5. Make reset idempotent and safe to rerun.
6. Remove deploy/refund/withdraw behavior from scripts/demo.sh.

Acceptance:

- A clean clone reaches healthy local services.
- Two resets produce identical canonical fixture hashes.
- No seed creates a VERIFIED payment without verifier evidence.

Verify:

- Start, check readiness, reset twice, and compare fixture hashes.

---

## FND-06 — Add root CI and mandatory pull-request gates

Priority: P0  
Depends on: FND-02, FND-03, FND-04  
Targets: .github/workflows/; package.json; contracts/; scripts/ci/

Current defect:

- The workflow under web/.github is not registered at repository root; integration tests use an unwritable Mongo cache; web and Foundry are not root gates.

Steps:

1. Add root jobs for install/typecheck/lint/unit/build, API integration, Foundry, static analysis, secret scan, and dependency review.
2. Use a writable Mongo binary path or service container; never silently skip integration tests.
3. Scan production artifacts for RefundProtocol ABI/imports/selectors and money-moving functions.
4. Cache by lockfile without secrets or broadcasts.
5. Upload test, gas, and static-analysis reports.
6. Require all P0 checks before merge.

Acceptance:

- Clean CI executes backend integration, web build, and contract tests.
- A deliberate production RefundProtocol import makes CI fail.

Verify:

- Attach one clean passing workflow and one negative allowlist run.

---

## RP-01 — Pin Circle upstream provenance and licensing

Priority: P0  
Depends on: none  
Targets: contracts/refund-protocol/; UPSTREAM.md; docs/fork-diff.md; license/notice files

Steps:

1. Pin Circle upstream commit a7ae494b67ceae4693b416efd52f835d7b53c690 and its remote.
2. Add tag circle-upstream-a7ae494.
3. Preserve Apache-2.0 material and inherited headers.
4. Pin Foundry, OpenZeppelin, forge-std, and all contract dependencies.
5. State that Finné is independent, unaudited, and not Circle-endorsed.
6. Document reviewed cherry-picks; disable automatic upstream merges.

Acceptance:

- The inherited tree and Finné diff are reproducible.
- No audit or endorsement implication remains.

Verify:

- Record remotes, tag, versions, license check, and fork diff.

---

## RP-02 — Reproduce inherited Refund Protocol risks in a research-only suite

Priority: P0  
Depends on: RP-01  
Targets: research/circle-refund-protocol/; docs/security/upstream-findings.md

Current defect:

- “53 tests pass” can be mistaken for safety despite inherited pooled-accounting and early-withdrawal risks.

Steps:

1. Preserve 36 upstream tests unchanged.
2. Add deterministic reproductions for issues 9–12, post-withdrawal pooled loss, debt bypass, repeated early withdrawal, state after external call, ERC-1271 failure, non-standard array hashing, and lack of partial refunds.
3. Add a separate PR 13 patched-reference profile.
4. Explain what PR 13 fixes and why pooled accounting remains unresolved.
5. Use no live RPC and no production registry imports.
6. Label all jobs/artifacts research or unsafe-reference.

Acceptance:

- Every inherited risk has a reproduction or documented explanation.
- Research cannot import production contracts.
- Passing results are never presented as Finné safety proof.

Verify:

- Attach upstream, vulnerable-reference, and patched-reference Foundry output.

---

## RP-03 — Quarantine RefundProtocol and enforce a deployment allowlist

Priority: P0  
Depends on: RP-01, RP-02, FND-04, FND-06  
Targets: contracts/; research/; backend/src/abi/; web/src/wallet.ts; scripts/; deployments/approved-contracts.json

Current defect:

- RefundProtocol.sol/ABI, refundByArbiter, withdraw, approve/pay, deployment scripts, indexer events, and UI copy remain executable.

Steps:

1. Move inherited code under research/circle-refund-protocol/UNSAFE_REFERENCE_ONLY.
2. Separate production/research source, cache, output, broadcast, and CI paths.
3. Delete production RefundProtocol ABIs, wallet refund/withdraw actions, reserve/debt reads, and deployment calls.
4. Allowlist only FinneCaseRegistry artifact names and bytecode hashes.
5. Make scripts reject non-allowlisted artifacts before submission.
6. Fail CI on RefundProtocol, refundByArbiter, withdraw, approveAndPay, depositArbiterFunds, or USDC approval to Finné in production bundles/config.
7. Keep old deployments only as labeled historical evidence.

Acceptance:

- Only FinneCaseRegistry is deployable.
- The app never requests USDC approval to Finné.
- Attempted RefundProtocol deployment fails before broadcast.
- Production bundles contain no inherited value-moving ABI.

Verify:

- Run the negative deployment test and inspect the release archive.

---

## BE-01 — Establish the versioned API shell, health checks, and errors

Priority: P0  
Depends on: FND-02, FND-03, FND-04, RP-03  
Targets: backend/src/app.ts; backend/src/errors.ts; backend/src/routes/; backend/src/server.ts

Current defect:

- Routes are unversioned, CORS is open, readiness/status are mixed, and errors lack codes, request IDs, and retry semantics.

Steps:

1. Mount business routes under /v1.
2. Implement /health/live, /health/ready, /v1/meta, /v1/me, and /v1/jobs/:jobId.
3. Add request IDs, structured log context, secure headers, route-specific body limits, and explicit CORS.
4. Return error.code, message, requestId, retryable, and safe optional details.
5. Readiness checks Mongo, queue, Arc RPC, required config, and manifest without secrets.
6. Do not gracefully skip required production packages.

Acceptance:

- Liveness remains 200 during dependency failure; readiness becomes safe 503.
- Every error has the canonical envelope.
- Unknown routes return typed 404.

Verify:

- Test live/ready, CORS, malformed/oversized bodies, 404, and 500 redaction.

---

## BE-02 — Replace escrow-centric Mongo models with registrar models

Priority: P0  
Depends on: BE-01, FND-03  
Targets: backend/src/models/; backend/src/db.ts; backend/src/migrations/

Current defect:

- Payout stores refundTo/lockup/refund/withdraw fields; Evidence stores raw fileOrText; Decision stores refund execution; countDocuments allocation can collide.

Steps:

1. Add tenants, users, wallets, invitations, challenges, sessions, payments, transfer attempts, payment items, policies, evidence uploads/items, proof runs, cases, submissions, analyses, decisions, corrections, chain events, audit events, jobs, and counters.
2. Store amounts as validated integer micro-USDC strings or bigint boundaries; never Number math.
3. Add unique tenant/business, tx/log, idempotency, one-decision, one-receipt, correction-replay, and version indexes.
4. Replace countDocuments allocation with atomic counters or unique-retry.
5. Add schemaVersion and immutable content hashes.
6. Preserve old records as legacy; never promote old escrow states to verified states without evidence.

Acceptance:

- Production models contain no escrow, debt, lockup, withdrawal, or original-refund lifecycle.
- Concurrent numbering/version/decision writes cannot collide.
- MongoDB stores no evidence bytes or raw signed URLs.

Verify:

- Run model/index, concurrency, and migration dry-run tests; document rollback.

---

## BE-03 — Implement versioned canonical envelopes and hash verification

Priority: P0  
Depends on: BE-02  
Targets: backend/src/canonical.ts; packages/domain/; backend/test/canonical.test.ts

Steps:

1. Define receipt, claim, response, analysis, decision, correction-instruction, and correction-verification envelopes.
2. Remove database/UI/transient/provider URL fields.
3. Canonicalize keys/numeric strings, UTF-8 encode, and keccak256.
4. Bind evidence hashes, policy version/hash, deterministic-check version, agent/model/prompt version, and chain IDs.
5. Verify using the envelope’s original schema version.
6. Publish TypeScript/Solidity golden vectors.

Acceptance:

- Key ordering does not change a hash.
- Changing any material source, amount, actor, or version changes it.
- Old envelopes remain verifiable after upgrades.

Verify:

- Run golden-vector, property, Unicode, amount-boundary, and tamper tests.

---

## BE-04 — Remove public privilege creation and add controlled platform auth

Priority: P0 security blocker  
Depends on: BE-01, BE-02  
Targets: backend/src/routes/auth.ts; backend/src/auth.ts; backend/src/middleware.ts; backend/src/rbac.ts

Current defect:

- /auth/register accepts caller-selected reviewer role.
- /auth/wallet creates a user from an unverified address and requested arbiter/merchant seat.

Steps:

1. Remove role/seat selection from all public payloads.
2. Disable public /auth/register in staging/submission.
3. Integrate Cognito/OIDC for operations and reviewers.
4. Map immutable IdP subject plus tenant assignment to role; never trust body/token-request roles.
5. Provision reviewers only through controlled administration/seed.
6. Validate issuer, audience, expiry, and revocation.
7. Separate OPERATIONS, REVIEWER, RECIPIENT, AGENT, and SYSTEM identities.

Acceptance:

- Anonymous users cannot create privileged accounts.
- Role, seat, display-name, or token-claim tampering cannot escalate access.
- Reviewer and operations permissions differ.

Verify:

- Test forged/wrong-audience/expired/revoked tokens, role tampering, and public reviewer creation.

---

## BE-05 — Add invitation-bound recipient wallet challenge authentication

Priority: P0 security blocker  
Depends on: BE-02, BE-04  
Targets: backend/src/routes/auth.ts; backend/src/auth/; backend/src/models/; web auth client

Current defect:

- /auth/wallet trusts an address; /auth/link-wallet assigns an address without ownership proof; access is not case-bound.

Steps:

1. Replace them with POST /v1/auth/recipient/challenges and /sessions.
2. Accept one-use invitation tokens in request bodies and store hashes only.
3. Bind invitations to tenant, case/payment, optional expected wallet, expiry, and consumption.
4. Generate domain, URI, chain, nonce, issued-at, and expiry statements; store nonce hashes.
5. Verify EOA and ERC-1271 modular-wallet signatures.
6. Prevent invitation/challenge/signature replay.
7. Issue resource-scoped sessions and implement DELETE /v1/auth/session.
8. Keep invitation/session secrets out of URLs, logs, analytics, and referrers.

Acceptance:

- Knowing an address cannot authenticate.
- Wrong invitation/domain/chain/wallet or expired nonce fails.
- Recipient sessions cannot access unrelated resources.

Verify:

- Test EOA/ERC-1271 positives and replay, expiry, wrong-domain/chain/wallet, and cross-case negatives.

---

## BE-06 — Enforce resource authorization and correct the RBAC matrix

Priority: P0 security blocker  
Depends on: BE-02, BE-04, BE-05  
Targets: backend/src/rbac.ts; backend/src/scope.ts; case/payout/brief/timeline/notification routes

Current defect:

- Reviewer has case:respond; detail routes inconsistently scope resources; responses hardcode Maya Reyes.

Steps:

1. Implement PRD permissions for operations, reviewer, recipient, agent, and system.
2. Remove response authority from reviewer/operations.
3. Add one authorizeResource(actor, action, resource) service for every read/write.
4. Check tenant and membership after loading each resource; list filters are insufficient.
5. Derive identities from sessions/invitations, never request fields or hardcoded names.
6. Scope notifications, jobs, evidence downloads, chain views, and public proofs.
7. Use non-enumerating 404 responses where appropriate.

Acceptance:

- All 36 operations have actor/resource rules.
- Cross-tenant and cross-recipient reads/writes fail.
- Agent cannot decide; reviewer cannot impersonate recipient; operations cannot edit decisions.

Verify:

- Run allow/deny route matrix and ID-enumeration tests.

---

## BE-07 — Add idempotent mutations, durable jobs, and append-only audit

Priority: P0  
Depends on: BE-01, BE-02, BE-03, BE-06  
Targets: backend/src/jobs/; backend/src/audit/; models; middleware

Steps:

1. Require Idempotency-Key on retryable writes.
2. Store tenant, actor, operation, request fingerprint, result reference, state, and expiry.
3. Replay identical requests; return 409 for key/fingerprint mismatch.
4. Implement job leases, heartbeat, retries, next-attempt, terminal error class, and DLQ reference.
5. Chain audit events with previousHash/eventHash plus request/job IDs.
6. Redact evidence bytes, secrets, signatures, and presigned URLs.
7. Authorize job reads against the parent resource.

Acceptance:

- Retries cannot duplicate payout, anchor, case, analysis, decision, or correction effects.
- A crash after external submission reconciles instead of blind resubmission.
- Audit tampering is detectable.

Verify:

- Run concurrent idempotency, crash/retry, lease-expiry, DLQ, and audit-chain tests.

---

## CON-01 — Scaffold the production FinneCaseRegistry

Priority: P0  
Depends on: FND-01, FND-04, RP-03  
Targets: contracts/finne-case-registry/src/FinneCaseRegistry.sol; foundry.toml; deployment allowlist

Current defect:

- Current registry is event-only, has one immutable operator, and cannot enforce duplicates, roles, states, amounts, or replay.

Steps:

1. Create a separate production Foundry package using pinned Solidity/OpenZeppelin.
2. Use AccessControl and Pausable with DEFAULT_ADMIN_ROLE, PLATFORM_ROLE, REVIEWER_ROLE, AGENT_ROLE.
3. Define CaseStatus, Outcome, ReceiptAnchor, and CaseAnchor.
4. Use opaque bytes32 IDs and uint128 micro-USDC amounts.
5. Add custom errors for roles, state, hashes, amounts, duplicates, and replay.
6. Make all mutations non-payable; add no token interface, allowance, transfer, refund, withdraw, rescue, fallback, or receive workflow.
7. Document that unsolicited ERC-20 transfers cannot be rejected and are irrecoverable.

Acceptance:

- ABI exposes no payable/value-moving selector.
- Native-value calls revert.
- Pause blocks mutations, not reads.
- Only configured roles can mutate.

Verify:

- Inspect ABI/selectors and run constructor, role, native-value, and pause tests.

---

## CON-02 — Register receipts and open bounded cases

Priority: P0  
Depends on: CON-01  
Targets: FinneCaseRegistry.sol; contract unit/fuzz tests

Steps:

1. Implement registerReceipt(paymentId, anchor).
2. Validate non-zero tx/bundle hashes, payer/recipient, amount, timestamp, and unique paymentId.
3. Implement openCase(caseId, paymentId, claimHash, challengedAmount, responseDueAt).
4. Require a registered receipt, unique case, non-zero claim hash, future deadline, and 0 < challenge ≤ receipt amount.
5. Initialize OPEN and emit indexed ReceiptRegistered/CaseOpened events with safe fields only.

Acceptance:

- A 300 USDC receipt registers once.
- A 100 USDC challenge succeeds; 0 and 301 fail.
- Unknown payment and duplicate case fail.
- Events support deterministic indexing without allegations.

Verify:

- Test happy path, zeros, duplicates, unknown payment, invalid deadline, and amount bounds.

---

## CON-03 — Enforce recipient response, analysis anchor, and human decision

Priority: P0  
Depends on: CON-02  
Targets: FinneCaseRegistry.sol; role/state tests

Steps:

1. Implement submitResponse; only stored recipient (or replay-safe signed relayer) before the deadline; one response.
2. Implement markUnderReview for REVIEWER_ROLE.
3. Implement anchorAnalysis for AGENT_ROLE with bounded version/hash.
4. Implement recordDecision for REVIEWER_ROLE only.
5. Require zero correction for recipient-upheld/dismissed outcomes and 0 < correction ≤ challenge for platform/partial outcomes.
6. Make decisions immutable.
7. Emit ResponseSubmitted, CaseUnderReview, AnalysisAnchored, HumanDecisionRecorded.

Acceptance:

- Platform/agent cannot submit recipient response.
- Agent cannot decide.
- Late/duplicate/post-decision response fails.
- Decision overwrite and invalid outcome/amount combinations fail.

Verify:

- Test every caller-role/state combination and signed-relayer replay if used.

---

## CON-04 — Record correction instruction, verification, and terminal closure

Priority: P0  
Depends on: CON-03  
Targets: FinneCaseRegistry.sol; closure/replay tests

Steps:

1. Implement markCorrectionOutstanding for PLATFORM_ROLE after a positive correction decision.
2. Implement recordCorrection(caseId, correctionTxHash, correctionHash).
3. Prevent correction transaction reuse globally.
4. Let only the offchain verifier/platform role record a matched transfer.
5. Implement closeNoCorrection for REVIEWER_ROLE only for no-correction outcomes.
6. Emit CorrectionInstructionRecorded, CorrectionVerified, CaseClosed.
7. Prevent all terminal-state regression.

Acceptance:

- Instruction alone cannot close.
- Zero/reused hashes, wrong state, or excess correction fail.
- Verified 100 USDC correction closes the partial case.
- No-correction outcomes close without funds touching the registry.

Verify:

- Test corrected and no-correction paths plus global replay and regression negatives.

---

## CON-05 — Complete Foundry, fuzz, invariant, gas, and static analysis

Priority: P0  
Depends on: CON-01, CON-02, CON-03, CON-04  
Targets: contracts/finne-case-registry/test/; CI; gas snapshots

Steps:

1. Cover full receipt-to-closure lifecycle and every unauthorized role.
2. Cover duplicates, zero/excess amounts, late responses, agent decision, overwrite, invalid outcome/amount, correction replay, closure regression, pause.
3. Fuzz IDs, amounts, deadlines, caller roles, and transitions.
4. Add invariants: no fund movement/authorization; supported calls do not change balances; one decision; terminal states never regress; correction ≤ challenge; correction tx globally unique.
5. Run gas snapshots and Slither; triage every finding.
6. Add mutation checks proving removal of access/replay/immutability/no-custody guards makes tests fail.

Acceptance:

- Unit/fuzz/invariant suites pass cleanly.
- No unresolved high-severity static finding.
- No supported workflow changes native or USDC balance.

Verify:

- Attach complete forge test, invariant, gas, and Slither output.

---

## AWS-01 — Create CDK stages, network, ingress, and base security

Priority: P0  
Depends on: FND-02, FND-04  
Targets: infra/cdk/; cdk.json; stage configuration

Steps:

1. Create TypeScript CDK app for local references, staging, and submission in ap-southeast-1.
2. Provision VPC, public ALB subnets, private ECS subnets, security groups, endpoints/NAT decision, TLS, and DNS inputs.
3. Add ECS clusters and task-role boundaries without application deployments yet.
4. Add tags, removal policies, stage isolation, and least-privilege defaults.
5. Output only safe identifiers.
6. Add cdk-nag or equivalent security checks and cost estimate/budget guard.

Acceptance:

- Synth/diff are deterministic.
- Database/storage/queue are not public.
- Only CloudFront/ALB-required ingress is open.
- No static AWS credentials are required.

Verify:

- npm run cdk:synth, security findings, infrastructure diff, and cost review.

---

## AWS-02 — Provision queue, evidence storage, secrets, and database connectivity

Priority: P0  
Depends on: AWS-01, BE-07  
Targets: infra/cdk/; backend queue/storage adapters; MongoDB Atlas configuration docs

Steps:

1. Provision SQS Standard plus DLQ, visibility timeout, redrive, encryption, and alarms.
2. Provision private versioned S3 evidence bucket with block-public-access, SSE-KMS, lifecycle, and CORS limited to the app.
3. Provision KMS keys and least-privilege API/worker roles.
4. Store Circle, identity, Mongo, and runtime secrets in Secrets Manager; inject by reference.
5. Configure MongoDB Atlas on AWS Singapore with TLS, least-privilege user, backup, and restricted connectivity.
6. Add local adapters that preserve the same interfaces without representing mocks as live evidence.

Acceptance:

- API cannot read arbitrary bucket keys; recipient cannot access another case.
- DLQ and KMS permissions work from the correct task roles.
- No secret is in CDK output, image, logs, or repository.

Verify:

- Run infrastructure tests, S3 cross-case negatives, SQS redrive, KMS denies, and Atlas TLS readiness.

---

## INT-01 — Implement typed Arc Testnet configuration and adapter boundaries

Priority: P0  
Depends on: FND-03, FND-04, BE-01  
Targets: backend/src/chain/; packages/domain/; deployments/arc-testnet.json

Steps:

1. Define ChainReader, TransferVerifier, RegistryWriter, WalletProvider, and ResolutionAdapter interfaces.
2. Validate Arc chain ID, RPC, explorer, USDC address, system emitter, Memo address/support, and registry address from typed config.
3. Normalize EVM addresses and transaction hashes; reject wrong-chain/zero/unallowlisted values.
4. Centralize explorer links and six-decimal micro-USDC conversion.
5. Add timeouts, retries, rate-limit handling, and safe RPC error classes.
6. Keep interfaces language-neutral enough for future Rust/Go adapters without building them now.

Acceptance:

- No Arc/Circle address or chain value is scattered through source.
- Wrong-chain and wrong-token inputs fail before persistence.
- Decimal conversion never uses floating point.

Verify:

- Unit tests for configuration, address normalization, amount boundaries, timeout/retry, and wrong-chain cases.

---

## INT-02 — Verify ordinary finalized Arc USDC transfers

Priority: P0  
Depends on: INT-01, BE-02, BE-03  
Targets: backend/src/chain/verifier.ts; chain decoder tests

Current defect:

- The indexer only accepts PaymentCreated events from RefundProtocol; it cannot import an ordinary final USDC transfer.

Steps:

1. Fetch transaction, receipt, block, and decoded logs from Arc RPC.
2. Verify chain, success, confirmations/finality rule, sender, recipient, token, amount, block/time, and transaction hash.
3. Decode Arc’s 18-decimal system USDC event and corresponding 6-decimal ERC-20 event.
4. Normalize to one six-decimal transfer and prevent double counting by transaction/log semantics.
5. Treat client/provider hashes as hints until this verifier passes.
6. Return deterministic VERIFIED or typed REJECTED reasons plus canonical source facts.

Acceptance:

- A real direct 300 USDC transfer verifies exactly once.
- Wrong sender/recipient/token/amount/chain, failed tx, or insufficient finality rejects.
- Dual events never become two payments.

Verify:

- Fixture tests for both event forms and a real Arc Testnet transaction with explorer link.

---

## INT-03 — Build a durable Arc indexer with cursor, finality, and replay safety

Priority: P0  
Depends on: INT-02, BE-07  
Targets: backend/src/indexer.ts; backend/src/backfill.ts; worker entrypoint; chain-event models

Current defect:

- Current rolling window has no persistent cursor/reorg policy and dispatches only RefundProtocol events.

Steps:

1. Persist chain ID, next block, finalized block/hash, and deployment start block.
2. Scan bounded ranges with adaptive chunking and retry/backoff.
3. Wait for the defined finality buffer before financial transitions.
4. Store events uniquely by chain/tx/log/emitter and projections by deterministic dedupe key.
5. Detect block-hash mismatch/reorg and safely rewind unfinalized projections.
6. Decode USDC, Memo where used, and FinneCaseRegistry events only.
7. Add controlled backfill/replay and heartbeat/lag metrics.

Acceptance:

- Restart resumes without gaps/duplicates.
- Reprocessing a range is idempotent.
- Unfinalized/reorged events cannot finalize payments/corrections.

Verify:

- Restart, overlap, replay, gap, rate-limit, malformed-log, and simulated-reorg tests plus staging lag evidence.

---

## INT-04 — Configure Circle server client and separated wallet inventory

Priority: P0  
Depends on: FND-04, AWS-02  
Targets: backend/src/integrations/circle/; wallet models; Secrets Manager wiring

Steps:

1. Verify the current official Circle SDK/API and Arc Testnet support before naming methods.
2. Create a server client using secret references and strict timeouts/retries.
3. Provision/reference separate platform payout EOA, registry platform wallet, reviewer wallet, and Proof Agent wallet.
4. Persist provider IDs and public addresses only; never raw keys/entity secrets.
5. Add wallet-purpose and chain allowlists so a role cannot be used for another purpose.
6. Add a startup inventory check with redacted output.

Acceptance:

- Platform, reviewer, agent, and recipient responsibilities are separated.
- No backend-held wallet can move disputed funds automatically.
- Missing/wrong-chain wallet configuration makes readiness fail.

Verify:

- Attach redacted wallet inventory, Circle request IDs, and negative role/purpose tests.

---

## INT-05 — Integrate Maya’s Circle modular passkey wallet

Priority: P0  
Depends on: BE-05, INT-04  
Targets: web recipient onboarding; backend Circle integration; wallet/session models

Steps:

1. Configure the passkey domain and create/connect Maya’s modular wallet on Arc Testnet.
2. Bind Circle wallet ID, smart-account address, owner/passkey reference, tenant, and user without storing authentication secrets.
3. Support ERC-1271 ownership proof in recipient challenge login.
4. Show explicit wallet/network/account state and recovery-safe error messages.
5. Prevent a newly connected wallet from replacing the invitation-bound wallet without controlled re-invitation.

Acceptance:

- Maya authenticates using ownership proof and sees only her case.
- Reload/new session restores the same wallet binding.
- Wrong domain/account/wallet fails safely.

Verify:

- Browser/passkey matrix plus backend ERC-1271 verification and Circle/Arc identifiers.

---

## INT-06 — Prove a sponsored modular-wallet user operation

Priority: P0  
Depends on: INT-05  
Targets: Circle Gas Station configuration; transfer-attempt service; staging runbook

Steps:

1. Verify current Arc Testnet Gas Station policy/capability in official docs/console.
2. Restrict sponsorship to approved chain, USDC token, registry/correction calls, amount bounds, and synthetic wallet.
3. Submit one harmless bounded user operation before wiring business closure.
4. Persist provider operation ID/userOpHash, lifecycle, errors, and eventual tx hash separately.
5. Reconcile success from Arc receipt/events, not provider status alone.
6. Add rejection, expiry, duplicate submission, and sponsorship-denied handling.

Acceptance:

- One sponsored operation reaches Arc without exposing a key.
- userOpHash is never presented as the final transaction hash.
- Policy rejects unrelated destinations/calldata/amounts.

Verify:

- Attach Circle operation evidence, final Arc tx/explorer link, decoded event, and negative policy results.

---

## INT-07 — Verify Circle webhooks and reconcile userOpHash to Arc transaction hash

Priority: P0  
Depends on: INT-03, INT-04, INT-05, INT-06, BE-07  
Targets: POST /v1/webhooks/circle; webhook store; reconciliation worker

Steps:

1. Verify webhook signature, timestamp tolerance, content type, and body bytes before parsing.
2. Persist provider event ID/payload hash once, acknowledge quickly, and enqueue.
3. Reject/replay-safe duplicate, stale, forged, or malformed events.
4. Correlate provider ID/userOpHash to eventual Arc tx hash.
5. Re-fetch Arc receipt and decode expected logs before changing payment/response/correction state.
6. Poll/reconcile missing or out-of-order webhook events.
7. Redact wallet metadata and provider secrets from logs.

Acceptance:

- A valid duplicate produces one effect.
- A provider “complete” status without matching Arc facts cannot close anything.
- Out-of-order/missing webhook recovers through reconciliation.

Verify:

- Signature/replay/stale/order tests plus one real userOpHash → txHash → decoded-event trace.

---

## CON-06 — Deploy, verify, and publish the Arc Testnet registry

Priority: P0  
Depends on: CON-05, FND-04, INT-04  
Targets: contract deployment scripts; deployments/arc-testnet.json; generated TypeScript bindings

Steps:

1. Compile with pinned compiler/optimizer.
2. Record ABI/bytecode and hashes.
3. Deploy only allowlisted FinneCaseRegistry through Circle Contracts where supported; use documented Foundry fallback only if blocked.
4. Verify source/settings on Arcscan.
5. Assign platform/reviewer/agent roles to separate approved testnet addresses; minimize deployer permissions.
6. Complete the deployment manifest and generate bindings from released ABI.
7. Run a post-deploy receipt-to-closure lifecycle.

Acceptance:

- Source is verified and manifest hashes match deployed bytecode.
- App/worker/tests share one manifest.
- Role holders match the approved wallet inventory.
- No secret/raw signature exists in artifacts.

Verify:

- Attach deployment tx, explorer/verification link, role reads, local-vs-chain hashes, and lifecycle transactions.

---

## PAY-01 — Create/import the real 300 USDC payout and register its receipt

Priority: P0  
Depends on: BE-02, BE-03, BE-06, BE-07, CON-02, INT-02, INT-03, INT-04  
Targets: payout/import routes; payout service; demo payout worker; receipt repository

Steps:

1. Implement POST /v1/demo/payouts as an operations-only 202 job using the platform Circle EOA.
2. Send exactly 300 testnet USDC to Maya; use Arc Memo correlation only if current wallet/account constraints support it.
3. Implement POST /v1/payments/import for an existing tx hash.
4. Run INT-02 verification before creating a VERIFIED payment.
5. Link the verified transfer to tenant, wallet, three payment items, policy version, and source facts.
6. Create one canonical receipt envelope and call registerReceipt only after human approval through the anchor endpoint.
7. Make payout/import/anchor idempotent.

Acceptance:

- One real 300 USDC tx creates one payment/receipt.
- Wrong or duplicate tx cannot create a second record.
- Original transfer remains final and never enters a Finné contract.
- Receipt anchor matches the stored envelope.

Verify:

- Attach Circle request/provider ID, Arc tx/explorer link, verifier output, receipt hash, registry tx/event, and idempotent replay.

---

## PAY-02 — Implement private, immutable evidence upload and download

Priority: P0  
Depends on: AWS-02, BE-02, BE-06, BE-07  
Targets: evidence routes/services; S3 adapter; scan/hash worker

Current defect:

- Current evidence route accepts fileOrText and stores it directly in MongoDB.

Steps:

1. Implement POST /v1/evidence/uploads to allocate immutable ID/object key and short-lived presigned upload.
2. Validate actor/resource/visibility, MIME, extension, declared size, and checksum.
3. Implement complete endpoint that HEAD/reads the object, enforces actual size/type, malware scan, SHA-256, and version finalization.
4. Store metadata/hash/provenance in MongoDB and bytes in private versioned S3.
5. Implement authorized short-lived download URLs; generate a fresh URL each time.
6. Prevent object-key injection, overwrite, cross-case access, incomplete evidence use, and unsafe content rendering.
7. Support SHARED, PLATFORM_INTERNAL, RECIPIENT_PRIVATE, SYSTEM visibility.

Acceptance:

- Claimant and recipient uploads have immutable chain-of-custody metadata.
- Unauthorized/cross-case downloads fail.
- Malicious, oversized, mismatched, or incomplete files never become evidence.

Verify:

- Upload/download positives; MIME/size/hash/malware/key-injection/cross-tenant/expiry negatives; S3/KMS evidence.

---

## PAY-03 — Add synthetic source adapters and deterministic proof checks

Priority: P0  
Depends on: FND-05, PAY-01, PAY-02  
Targets: backend/src/sources/; backend/src/proof/deterministic/; fixtures/

Steps:

1. Define versioned read-only adapters for agreement, payment calculation, deliverables/acceptance, policy, and platform analytics.
2. Seed three deliverables and authentic-view policy evidence using synthetic data only.
3. Run deterministic checks before AI: chain/token/parties/amount/finality, item sum = 300 USDC, policy effective date/hash, deliverable mapping, acceptance timestamps, 100 USDC challenge bound, and response deadline.
4. Persist inputs/outputs/version/source hashes in a proof run.
5. Treat missing/contradictory data as findings, never invented values.
6. Ensure model output cannot override deterministic facts.

Acceptance:

- The same input bundle gives byte-stable deterministic output.
- Failures identify exact source/field.
- 300/100 arithmetic uses integer micro-USDC.

Verify:

- Golden fixtures for pass, missing evidence, amount mismatch, policy mismatch, and contradictory acceptance.

---

## PAY-04 — Build the evidence graph, readable receipt, and proof anchor flow

Priority: P0  
Depends on: PAY-01, PAY-02, PAY-03, BE-03, CON-02  
Targets: evidence-graph service; payment read model; proof run/approval/anchor routes

Steps:

1. Build nodes/edges connecting payment, items, agreement, policy, deliverables, acceptance, analytics, and evidence versions.
2. Produce a human-readable receipt with source citations and deterministic verification status.
3. Implement POST /v1/payments/:id/proof-runs as a job.
4. Require operations human approval before POST /anchors writes the receipt/bundle hash.
5. Persist draft/approved/anchored versions; never mutate an approved envelope.
6. Implement GET payment detail and minimal public proof without allegations/documents/PII.

Acceptance:

- Every material receipt fact resolves to a source hash/version.
- Approval anchors exactly the reviewed envelope.
- Public proof reveals only safe payment/anchor fields.

Verify:

- Citation resolution/tamper tests, approval race/idempotency tests, and Arc registry event comparison.

---

## CASE-01 — Open one immutable, bounded 100 USDC case and issue notice

Priority: P0  
Depends on: PAY-04, BE-05, BE-06, BE-07, CON-02  
Targets: POST /v1/payments/:id/cases; invitation service; case models/read models

Current defects:

- amountContested is an unbounded string; both recipient/reviewer can open; numbering can collide; open-dispute route depends on RefundProtocol.

Steps:

1. Allow operations for the payment tenant to open a case only after the receipt is approved/anchored.
2. Validate 0 < challenge ≤ payment amount and canonical scenario = 100e6 micro-USDC.
3. Freeze claim type, allegation, cited evidence IDs, policy version, amount, openedAt, and 72-hour responseDueAt in the claim envelope.
4. Allocate an opaque unique case ID transactionally.
5. Create one-use recipient invitation and disclose the exact claim/shared evidence.
6. Anchor openCase and reconcile its event.
7. Make opening idempotent and reject duplicate active case for the seeded MVP.

Acceptance:

- 100 succeeds; 0/301 or unknown/unverified payment fails.
- Claim cannot be edited after creation.
- Recipient receives case-bound notice/invitation.
- No sensitive allegation text appears onchain.

Verify:

- Amount/role/duplicate/concurrency tests plus claim-hash-to-event comparison.

---

## CASE-02 — Enforce recipient response, evidence freeze, deadlines, and case reads

Priority: P0  
Depends on: CASE-01, PAY-02, BE-05, BE-06, CON-03  
Targets: case detail/list; response routes; case service; timeline

Current defects:

- submitResponse catches illegal transitions and still saves after decision; reviewer can fake deadline_passed and decide early; author is hardcoded.

Steps:

1. Build role-filtered list/detail read models with allowedActions calculated server-side.
2. Accept one recipient response before responseDueAt; derive author/session identity.
3. Freeze response text/evidence IDs/hash/version and submit/relay registry response.
4. Do not catch and ignore illegal transition errors.
5. Prevent reviewer decision before response or true deadline; scheduler may advance only from stored current time.
6. Freeze ordinary evidence at UNDER_REVIEW/decision per documented rule.
7. Build a reproducible timeline from audit/chain/business events.

Acceptance:

- Reviewer/platform/agent cannot submit recipient response.
- Late, duplicate, post-review, and post-decision responses fail.
- A reviewer cannot manufacture deadline passage.
- Case/timeline visibility is tenant/resource scoped.

Verify:

- Clock-controlled deadline tests, all role/state combinations, hash/event reconciliation, and cross-case read negatives.

---

## AGENT-01 — Define the versioned non-verdict fact-pack schema and prompt

Priority: P0  
Depends on: PAY-03, CASE-02, BE-03  
Targets: packages/domain agent schemas; backend/src/agent/prompts/; evaluation fixtures

Current defect:

- Current brief model is caller-supplied checks/inconsistencies/missingItems; agentVersion is incorrectly set to the chain name.

Steps:

1. Define output: verifiedFacts, partyClaims, chronology, calculations, contradictions, missingEvidence, unresolvedQuestions, citations, confidence, and limitations.
2. Require source ID/hash/version for every material statement.
3. Bind model, prompt, tool, schema, policy, deterministic-check, and input-bundle versions.
4. Explicitly forbid verdict, liability, fraud declaration, legal conclusion, recommended outcome, and transfer instruction.
5. Treat uploaded/source text as untrusted data, never instructions.
6. Add strict Zod/JSON schema with unknown fields rejected.

Acceptance:

- Verdict-shaped keys/language and uncited material claims fail validation.
- Deterministic facts are input constraints, not model-editable outputs.
- Output can be reproduced from stored versions.

Verify:

- Schema positives plus verdict, uncited, unknown-field, fake-source, and deterministic-conflict negatives.

---

## AGENT-02 — Implement the asynchronous Proof Agent runner with citations

Priority: P0  
Depends on: AGENT-01, BE-07  
Targets: backend/src/agent/runner.ts; worker; POST /v1/cases/:id/analysis-runs

Steps:

1. Load only authorized tenant/case evidence and deterministic results.
2. Extract bounded text safely; preserve source offsets/page/record references.
3. Invoke the configured model with structured output, time/token limits, retries, and version metadata.
4. Resolve every citation against the input bundle; reject nonexistent/out-of-scope citations.
5. Compare model statements against deterministic facts and flag conflicts.
6. Store immutable DRAFT analysis; never anchor or decide automatically.
7. Emit safe job progress and audit events.

Acceptance:

- Agent reads real stored evidence rather than a caller-built brief.
- Every material fact has a resolvable citation.
- Timeout/provider failure is retryable and cannot alter case state.

Verify:

- Golden-run, provider-failure/retry, citation-integrity, tenant-isolation, and deterministic-precedence tests.

---

## AGENT-03 — Add prompt-injection guardrails, human approval, evaluation, and anchoring

Priority: P0  
Depends on: AGENT-02, CON-03  
Targets: agent sanitization/validators; analysis approval route; eval suite

Steps:

1. Normalize/extract supported evidence types; quarantine active content and strip hidden instructions/metadata where safe.
2. Delimit each source and tell the model source text is evidence, not authority.
3. Detect prompt injection, data exfiltration requests, cross-tenant references, fake citations, and verdict language.
4. Implement reviewer approval of exactly one validated analysis version.
5. Hash the approved fact pack and queue anchorAnalysis; reconcile its event.
6. Create an evaluation set covering canonical case, missing data, contradictions, malicious evidence, verdict requests, and deterministic conflict.
7. Set release thresholds for schema validity, citation precision, forbidden-verdict rate, and tenant leakage.

Acceptance:

- Malicious evidence cannot reveal secrets, change scope, fabricate sources, or cause a verdict.
- Only a named human-approved version is anchored.
- Evaluation thresholds pass before release.

Verify:

- Run prompt-injection/red-team/eval suites and compare approved bundle hash to Arc event.

---

## DEC-01 — Build the reviewer read model and immutable human decision

Priority: P0  
Depends on: CASE-02, AGENT-03, BE-06, BE-07, CON-03  
Targets: reviewer case service; POST /v1/cases/:id/decisions; decision model

Current defects:

- Current decision route auto-advances AWAITING_RESPONSE, creates refundByArbiter calldata, and allows refund/release/no_action rather than a bounded correction decision.

Steps:

1. Return side-by-side claim, response, shared evidence, policy, deterministic facts, approved agent analysis, contradictions, missing evidence, and allowed actions.
2. Require REVIEWER role, real response or expired deadline, approved analysis, typed outcome, rationale, and correction amount.
3. Support RECIPIENT_UPHELD, PLATFORM_UPHELD, PARTIAL_PLATFORM_UPHELD, and DISMISSED_INSUFFICIENT_EVIDENCE.
4. Enforce zero correction for no-correction outcomes and 0 < correction ≤ challenged amount otherwise.
5. Create exactly one immutable decision and hash; no refund calldata or money action.
6. Anchor recordDecision and reconcile it before marking DECIDED.

Acceptance:

- Agent/operations/recipient cannot decide.
- AWAITING_RESPONSE cannot be bypassed.
- Duplicate/overwrite and invalid outcome/amount fail transactionally.
- Human identity and decision hash are auditable.

Verify:

- Role/state/outcome/amount/concurrency tests plus decision-hash-to-event comparison.

---

## COR-01 — Create an exact non-custodial voluntary correction instruction

Priority: P0  
Depends on: DEC-01, CON-04, BE-03, BE-07  
Targets: correction service/model; POST correction-instructions; GET correction detail

Steps:

1. Define VOLUNTARY_REPAYMENT adapter with recipient, platform destination, Arc chain, USDC token, 100e6 amount, case/decision IDs, expiry, and safe reference.
2. Derive every value from verified payment and immutable decision; accept no client override.
3. Create one immutable instruction hash and mark CORRECTION_OUTSTANDING onchain.
4. Return role-safe detail and allowed actions.
5. An instruction is a request, not payment proof; it cannot close the case.
6. Support explicit recipient decline without changing the original payment/decision.

Acceptance:

- Instruction is exactly 100 USDC to the verified destination/token/chain.
- Tampered fields invalidate intent.
- Creating/retrying an instruction is idempotent and cannot close.

Verify:

- Derivation/tamper/expiry/idempotency/decline tests and instruction event comparison.

---

## COR-02 — Submit the voluntary correction from Maya’s sponsored wallet

Priority: P0  
Depends on: COR-01, INT-05, INT-06, INT-07  
Targets: wallet-intent/transaction routes; Circle wallet UI/service; transfer attempts

Steps:

1. Implement wallet-intents to validate current instruction and generate exact USDC calldata.
2. Show Maya destination, token, amount, chain, case reference, expiry, and voluntary nature before passkey authorization.
3. Submit through the modular wallet/Gas Station and store provider ID/userOpHash.
4. Implement transaction attachment as a 202 hint only.
5. Handle rejected signature, sponsorship rejection, timeout, duplicate click, provider failure, and expiry.
6. Never let server/agent/reviewer sign on Maya’s behalf.

Acceptance:

- Maya can authorize exactly 100 USDC; changing calldata/amount/destination is rejected.
- Rejection/decline leaves the original payment and decision unchanged.
- Duplicate submission does not send twice.

Verify:

- Browser/passkey success and failure matrix plus Circle operation evidence; no case closure yet.

---

## COR-03 — Independently verify the correction and close the case

Priority: P0  
Depends on: COR-02, INT-02, INT-03, INT-07, CON-04  
Targets: POST correction verify; reconciliation worker; case/correction read models

Steps:

1. Resolve userOpHash/provider ID to final Arc tx hash.
2. Verify finality, sender = Maya wallet, recipient = instruction destination, token = Arc USDC, amount = 100e6, success, and non-reuse.
3. Persist normalized proof and transition SUBMITTED → VERIFIED; mismatch → MISMATCH with exact reason.
4. Call recordCorrection only after the verifier passes.
5. Reconcile registry event, then close case as CLOSED_CORRECTED.
6. Keep original 300 USDC payment immutable and visible alongside the separate correction.

Acceptance:

- Wrong sender/recipient/token/amount/chain, failed/unfinalized/reused tx cannot close.
- One verified 100 USDC transaction closes exactly one case.
- Public proof shows two distinct final transfers and minimized anchors.

Verify:

- Mismatch/replay/finality tests plus complete real Arc correction and registry closure evidence.

---

## UI-01 — Replace prototype auth/state with API-backed roles and product language

Priority: P0  
Depends on: FND-01, FND-02, BE-04, BE-05, BE-06  
Targets: web/src/App.tsx; web/src/useFinne.ts; Login.tsx; Sidebar.tsx; routes/types/copy

Current defects:

- useFinne holds simulated case/wallet state and escrow/refund/debt copy; a “View as” switch can imply role changes.

Steps:

1. Remove production role override, wallet simulation, timer-driven confirmation, and local business-state transitions.
2. Load session, permissions, allowed actions, and states from the API.
3. Implement platform OIDC and recipient invitation/passkey flows.
4. Add protected routes per role/resource and session-expiry/logout handling.
5. Replace merchant/customer/arbiter ambiguity with operations, recipient, and human reviewer.
6. Replace escrow/refund/reversal copy with receipt, claim, response, human decision, voluntary correction, and verified closure.
7. Keep any demo seat switcher only behind explicit local DEMO_MODE and never as authorization.

Acceptance:

- Reload derives state from backend.
- UI hiding is backed by server authorization.
- No production simulation can mark a transaction/decision/case complete.

Verify:

- Component/router/auth tests plus production-bundle scan for old terms and simulation flags.

---

## UI-02 — Build dashboard, payout creation/import, and verified receipt

Priority: P0  
Depends on: UI-01, PAY-01, PAY-04  
Targets: Ledger.tsx; NewPayout.tsx; Receipt.tsx; Platform.tsx; API client

Steps:

1. Show tenant payment list, verification/proof/anchor states, recent activity, and safe jobs.
2. Build the 300 USDC demo payout and existing-transaction import forms with idempotent submission.
3. Poll job state and surface Circle/Arc phases without calling userOpHash a transaction hash.
4. Show verified sender, recipient, token, amount, block/time/finality, three items, policy, evidence citations, hashes, and explorer links.
5. Require explicit human proof approval before anchor.
6. Handle empty/loading/retry/rejected/wrong-chain/duplicate states.

Acceptance:

- Every displayed chain fact comes from the verified read model.
- Receipt clearly says original payment is final and Finné is non-custodial.
- Explorer/hash copy actions point to the authoritative transaction.

Verify:

- Component/API tests and browser run against a real imported 300 USDC transaction.

---

## UI-03 — Build bounded case room, two-sided evidence, agent brief, and human decision

Priority: P0  
Depends on: UI-01, CASE-01, CASE-02, AGENT-03, DEC-01  
Targets: OpenDisputeModal.tsx; CaseRoom.tsx; Disputes.tsx; Decision.tsx; Timeline.tsx

Steps:

1. Open a fixed 100 USDC claim with cited evidence and clear 72-hour response window.
2. Give Maya the exact allegation/shared evidence, immutable upload, and one response flow.
3. Render deterministic facts separately from party claims and agent analysis.
4. Show source-linked chronology, contradictions, missing evidence, confidence, and limitations.
5. Label the agent “prepares facts; does not decide.”
6. Build reviewer comparison and decision controls with outcome/amount constraints and named human confirmation.
7. Remove refund signing, release funds, debt, withdraw, and early-decision interactions.

Acceptance:

- Claimant, recipient, and reviewer see correct resource-scoped actions.
- The UI cannot submit after deadline/decision or bypass backend state.
- Decision screen creates no money-moving transaction.

Verify:

- Role/state component tests, keyboard checks, and browser flow through anchored human decision.

---

## UI-04 — Build voluntary correction, verified closure, public proof, and accessibility

Priority: P0  
Depends on: UI-03, COR-01, COR-02, COR-03  
Targets: correction/final screens; public proof; global async/error/accessibility styles

Steps:

1. Show exact correction instruction and voluntary authorization disclosure.
2. Integrate passkey signing with explicit awaiting/rejected/submitted/verifying/mismatch/verified states.
3. Show userOpHash only as provider operation; replace it with final Arc tx when reconciled.
4. Show final receipt with original 300 and separate 100 transfers, human decision, anchors, and closure.
5. Build privacy-minimized public proof.
6. Add focus order, labels, live regions, contrast, reduced motion, mobile/tablet layouts, and safe error copy.
7. Remove all timers that simulate transaction confirmation.

Acceptance:

- Only verified Arc facts produce the completed state.
- Signature rejection/mismatch never looks closed.
- Core screens meet WCAG 2.1 AA checks and work at 320px width.

Verify:

- Component tests, axe, keyboard/mobile checks, and real correction browser evidence.

---

## AWS-03 — Deploy web, API, worker/indexer, observability, and OIDC CI/CD

Priority: P0  
Depends on: AWS-01, AWS-02, UI-04, INT-03  
Targets: infra/cdk/; Dockerfiles; .github/workflows/deploy.yml; CloudWatch

Steps:

1. Deploy web to private S3 behind CloudFront OAC.
2. Deploy API and worker/indexer as separate ECS Fargate services; route /v1 through HTTPS ALB/CloudFront.
3. Inject Secrets Manager values and deployment manifest; use health/readiness probes and rolling rollback.
4. Add structured logs, traces, dashboards, and alarms for readiness, errors, queue age/DLQ, indexer lag, webhook failure, agent failure, and correction mismatch.
5. Add GitHub OIDC deployment roles; no static cloud keys.
6. Add staging then submission promotion with manual approval and rollback.
7. Add cost budget alarms and log retention/redaction.

Acceptance:

- Stable public URL serves the same-origin app/API.
- API/worker/indexer scale/restart independently without duplicate effects.
- A failed deploy rolls back; alerts contain no sensitive evidence.

Verify:

- CDK diff, deploy logs, health checks, task restart/retry test, alarm test, public URL, and rollback evidence.

---

## QA-01 — Complete unit, API integration, security, and agent tests

Priority: P0  
Depends on: all BE, PAY, CASE, AGENT, DEC, COR issues  
Targets: backend/test/; packages/domain tests; agent evals; security suite

Steps:

1. Cover all state transitions, amount/deadline bounds, hashing, schemas, IDs, and idempotency.
2. Run all 36 API operations through Mongo-backed integration tests without skipped suites.
3. Test authentication, authorization, invitation/signature replay, cross-tenant access, evidence controls, webhook validation, and secret redaction.
4. Test agent schema/citations/verdict prohibition/prompt injection/tenant isolation/deterministic precedence.
5. Add coverage thresholds around critical domain/security code.
6. Fix test teardown so setup failure does not throw a second misleading error.

Acceptance:

- No skipped P0 suite.
- Removing a critical authorization/state/replay/guardrail check causes failure.
- Critical-path coverage meets documented threshold.

Verify:

- Attach clean root unit/integration/security/eval outputs and coverage report.

---

## QA-02 — Complete contract and live Arc/Circle integration verification

Priority: P0  
Depends on: CON-06, INT-07, COR-03, QA-01  
Targets: staging integration tests; release-evidence/chain/

Steps:

1. Run complete Foundry unit/fuzz/invariant/static suite.
2. Verify platform payout, transfer import, dual-event normalization, receipt anchor, case, response, analysis, human decision, sponsored correction, correction verification, and closure on Arc Testnet.
3. Check every stored hash/amount/address/state against decoded events and deployment manifest.
4. Test retry/reconciliation after worker restart and delayed/out-of-order webhook.
5. Confirm no transaction sends USDC/approval to Finné contracts.
6. Capture explorer links and redacted Circle request/operation IDs.

Acceptance:

- One complete real testnet lifecycle passes from clean state.
- All money movement is original payout or recipient-authorized correction.
- Stored projections reproduce from chain events.

Verify:

- Publish machine-readable integration report and resolvable explorer/verification links.

---

## QA-03 — Automate the golden path in Playwright and run two clean rehearsals

Priority: P0  
Depends on: UI-04, AWS-03, QA-02  
Targets: e2e/; demo reset; release-evidence/e2e/

Steps:

1. Automate platform login, 300 payout/import, receipt verification/approval, 100 case, recipient login/response, analysis, reviewer decision, correction authorization, verification, and closure.
2. Assert role-specific visibility, exact amounts, hashes, explorer links, and final states.
3. Cover signature rejection, wrong network, expired invitation, analysis failure/retry, correction mismatch, and duplicate clicks.
4. Keep passkey/manual-wallet steps in a documented manual matrix where browser automation cannot safely own credentials.
5. Reset and execute two clean sessions without database editing or hidden mocks.
6. Record timings against the three-minute demo path.

Acceptance:

- Automated golden path passes on staging.
- Two clean rehearsals produce distinct real transactions and identical business outcomes.
- No manual database/contract correction is needed.

Verify:

- Attach Playwright report/video/screenshots, manual matrix, transaction list, and rehearsal checklist.

---

## DOC-01 — Publish final repository, architecture, security, API, and release evidence

Priority: P0  
Depends on: QA-03  
Targets: README.md; docs/architecture.md; docs/security/; docs/api/; docs/deployment.md; docs/demo.md; release-evidence/

Steps:

1. Rewrite README around the registrar product and 300/100 golden path.
2. Document architecture, actors, data/state flows, non-custody boundary, onchain/offchain split, and adapter interfaces.
3. Publish OpenAPI, local setup, staging deployment, configuration, migration, rollback, and demo reset.
4. Publish threat model, upstream quarantine, known limitations, synthetic-data rule, and unaudited testnet disclaimer.
5. Link public app, verified registry, deployment/role manifest, original payment, anchors, correction, and final closure.
6. Add reproducible test commands and latest evidence.
7. Add a three-minute demo script that never claims reversal, escrow, AI adjudication, or production readiness.
8. Audit all links and remove secrets/presigned URLs/personal data.

Acceptance:

- A clean reviewer can run locally and verify the testnet lifecycle.
- Every external claim has repository, test, deployment, or explorer evidence.
- Documentation matches code/API/contract and the locked positioning.

Verify:

- Fresh-clone documentation test, link checker, secret scan, release-archive inspection, and founder review.

---

## Final MVP readiness checklist

Do not mark the repository MVP-ready until all 53 issues above are PASS and the following succeeds twice:

1. Northstar sends Maya 300 testnet USDC on Arc.
2. Finné independently verifies the finalized transfer and creates one receipt.
3. A human approves and anchors the receipt hash.
4. Northstar opens an immutable 100 USDC case.
5. Maya authenticates by wallet ownership, sees the exact claim, and responds with evidence.
6. Deterministic checks run before the Proof Agent.
7. The Proof Agent produces cited facts, chronology, contradictions, and missing evidence with no verdict.
8. A named human reviewer records one immutable partial decision.
9. Finné issues a precise voluntary 100 USDC correction instruction.
10. Maya authorizes a separate sponsored transfer from her Circle modular wallet.
11. Finné maps userOpHash to the final Arc transaction, verifies all transfer facts, records correction, and closes.
12. The original 300 USDC payment remains unchanged; no Finné contract ever holds or moves funds.

## Existing baseline observed during this audit

- Backend TypeScript typecheck: PASS.
- Backend unit tests: 38 PASS.
- Backend Mongo integration suite: did not run because mongodb-memory-server attempted to create /root/.cache/mongodb-binaries; the teardown then dereferenced an uninitialized server.
- Web build: did not run in this checkout because the installed web node_modules lacked tsc.
- Foundry: unavailable in the audit runner; contract claims were source-reviewed but not re-executed here.
- These baseline results are not evidence that the target MVP passes.

## Appendix A — Canonical P0 API operations

FND-03 must freeze these exact operations. A later issue may implement a route, but must not silently rename or remove it.

| # | Method and path | Authorized actor | Success |
|---:|---|---|---:|
| 1 | GET /health/live | Public probe | 200 |
| 2 | GET /health/ready | Operations/probe | 200/503 |
| 3 | GET /v1/meta | Public | 200 |
| 4 | GET /v1/me | Authenticated actor | 200 |
| 5 | POST /v1/auth/recipient/challenges | Invitation holder | 201 |
| 6 | POST /v1/auth/recipient/sessions | Invitation holder + wallet | 201 |
| 7 | DELETE /v1/auth/session | Recipient | 204 |
| 8 | GET /v1/jobs/:jobId | Parent-resource actor | 200 |
| 9 | GET /v1/dashboard | Operations/reviewer | 200 |
| 10 | POST /v1/demo/payouts | Operations | 202 |
| 11 | POST /v1/payments/import | Operations | 202 |
| 12 | GET /v1/payments | Operations/reviewer | 200 |
| 13 | GET /v1/payments/:paymentId | Operations/reviewer/scoped recipient | 200 |
| 14 | POST /v1/payments/:paymentId/proof-runs | Operations | 202 |
| 15 | POST /v1/payments/:paymentId/anchors | Operations | 202 |
| 16 | POST /v1/payments/:paymentId/cases | Operations | 202 |
| 17 | GET /v1/cases | Operations/reviewer/scoped recipient | 200 |
| 18 | GET /v1/cases/:caseId | Case parties/reviewer | 200 |
| 19 | POST /v1/cases/:caseId/recipient-invitations | Operations | 201 |
| 20 | POST /v1/evidence/uploads | Authorized case/payment actor | 201 |
| 21 | POST /v1/evidence/uploads/:uploadId/complete | Upload owner | 201 |
| 22 | GET /v1/evidence/:evidenceId/download | Visibility-authorized actor | 200 |
| 23 | POST /v1/cases/:caseId/responses | Recipient | 201 |
| 24 | POST /v1/responses/:responseId/transactions | Recipient | 202 |
| 25 | POST /v1/cases/:caseId/analysis-runs | Reviewer | 202 |
| 26 | POST /v1/cases/:caseId/analysis-approvals | Reviewer | 202 |
| 27 | POST /v1/cases/:caseId/decisions | Reviewer only | 202 |
| 28 | POST /v1/cases/:caseId/correction-instructions | Operations | 202 |
| 29 | GET /v1/corrections/:correctionId | Case parties/reviewer | 200 |
| 30 | POST /v1/corrections/:correctionId/wallet-intents | Recipient | 201 |
| 31 | POST /v1/corrections/:correctionId/transactions | Recipient | 202 |
| 32 | POST /v1/corrections/:correctionId/decline | Recipient | 200 |
| 33 | POST /v1/corrections/:correctionId/verify | Operations | 202 |
| 34 | POST /v1/webhooks/circle | Circle with valid signature | 202 |
| 35 | GET /v1/chain/transactions/:hash | Authorized case/payment actor | 200 |
| 36 | GET /v1/public/proofs/:proofId | Public | 200 |

API-wide rules:

- Every authenticated read is tenant and resource scoped.
- Every retryable write requires Idempotency-Key.
- Every asynchronous response returns jobId and status URL.
- Client-supplied provider IDs, userOpHash, and transaction hashes are hints until Arc reconciliation.
- No generic PATCH/DELETE exists for immutable receipt, claim, response, analysis, decision, instruction, or audit records.
- Invitation/session secrets never appear in URLs.

## Appendix B — Current repository hot spots

| Current path/symbol | Observed problem | Owning issues |
|---|---|---|
| backend/src/routes/auth.ts /auth/register | Caller chooses reviewer role | BE-04 |
| backend/src/routes/auth.ts /auth/wallet | Address accepted without proof; caller chooses seat | BE-04, BE-05 |
| backend/src/routes/auth.ts /auth/link-wallet | Wallet linked without ownership signature | BE-05 |
| backend/src/rbac.ts reviewer matrix | Reviewer can submit recipient response | BE-06 |
| backend/src/routes/cases.ts GET detail | No consistent resource membership check | BE-06 |
| backend/src/services.ts submitResponse | Illegal transition swallowed; post-decision response stored | CASE-02 |
| backend/src/services.ts recordDecision | Fakes deadline passage and returns refund calldata | DEC-01 |
| backend/src/services.ts nextCaseNumber/nextBriefVersion | countDocuments race | BE-02 |
| backend/src/models/index.ts Evidence.fileOrText | Raw evidence stored in MongoDB | PAY-02 |
| backend/src/routes/briefs.ts | Caller writes brief; no Proof Agent runs | AGENT-01, AGENT-02 |
| backend/src/routes/briefs.ts agentVersion | Chain name used as placeholder | AGENT-01 |
| backend/src/indexer.ts | RefundProtocol-only rolling scan; no durable cursor/finality | INT-02, INT-03 |
| backend/src/env.ts | Old hardcoded contracts and unsafe defaults | FND-04 |
| backend/src/abi/RefundProtocol.json | Unsafe ABI remains production-visible | RP-03 |
| contracts/refund-protocol/src/FinneCaseRegistry.sol | Event-only, one operator, no lifecycle enforcement | CON-01–CON-04 |
| contracts/refund-protocol/script/DeployContracts.s.sol | Deploys unsafe RefundProtocol | RP-03 |
| web/src/wallet.ts | refundByArbiter/withdraw injected-wallet flow | RP-03, COR-02 |
| web/src/useFinne.ts | Simulated business/transaction state and escrow copy | UI-01 |
| web/src/screens/Decision.tsx | Refund/release/no-action flow | DEC-01, UI-03 |
| README.md | Old escrow/debt narrative and 100/33 demo | FND-01, DOC-01 |
