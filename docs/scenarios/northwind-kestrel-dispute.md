# Scenario — Northwind Software Ltd. v. Studio Kestrel

> Dispute‑resolution demonstration scenario for the Finné agentic layer.
> Jurisdiction: **England & Wales**. The contested tranche is engineered so that all
> four evaluations — *(a) transaction happened, (b) right order, (c) governing law,
> (d) ToS accordance* — have something to say, and so evaluation **(b) ordering** is
> the crux of the dispute.
>
> This is a **mock**. The parties are fictional. Not legal advice.

---

## 1 · Parties

| Seat | Party | Role |
|---|---|---|
| **Platform** (payer) | **Northwind Software Ltd.** — a UK SaaS company, registered in England & Wales | Releases milestone payouts in USDC on Arc; holds the acceptance decision |
| **Recipient** (payee) | **Studio Kestrel** — a sole‑trader content & motion‑design studio | Produces the deliverables; receives USDC to its designated wallet |

**Network:** USDC on **Arc** (chain ID `5042002`). Payments are identified by their
on‑chain `Transfer` event and block timestamp — there is no separate off‑chain "payment
ledger"; the chain is the source of truth (C3 indexer).

---

## 2 · Use case & milestones

Milestone‑based **content‑production** contract, paid in USDC. The full Terms of Service
governing these milestones live in [`northwind-kestrel-tos.md`](./northwind-kestrel-tos.md).

| # | Deliverable | Amount (USDC) | Status |
|---|---|---|---|
| M1 | Brand kit + design brief | 700 | accepted, paid |
| M2 | Three explainer videos | 1,000 | accepted, paid |
| M3 | UI motion assets (hero animations) | **500** | **CONTESTED** |
| M4 | Final handover pack | 300 | pending |
| | **Total** | **2,500** | |

---

## 3 · The dispute (the contested tranche — M3, 500 USDC)

Northwind **released the 500 USDC for M3 on‑chain**, then **rejected M3 in writing** for
non‑conformance. Northwind disputes the 500 USDC and wants it back, on the grounds that
**the payment was released *before* written acceptance of M3** — i.e. **the wrong order**.

Studio Kestrel counters that **the USDC transfer *is itself* acceptance** of M3, and that
the later written rejection is therefore invalid.

The dispute turns on **Clause 4 — Order of performance** (see the ToS): payment must
follow acceptance, and a transfer before acceptance is *not* acceptance.

---

## 4 · Timeline (the facts the agents point at)

Every timestamp below is an input to a deterministic check. All times are UTC.

| Date | Event | Relevance |
|---|---|---|
| 2025‑05‑04 | Agreement signed | Effective date; governs all milestones |
| 2025‑05‑12 | M1 submitted | M1 acceptance clock starts (ToS 3.1) |
| 2025‑05‑16 | M1 **accepted in writing** | Within the 7‑business‑day window ✓ |
| 2025‑05‑17 | **700 USDC paid** for M1 (on‑chain `Transfer`) | Correct order: acceptance → payment ✓ |
| 2025‑05‑28 | M2 submitted | M2 acceptance clock starts |
| 2025‑06‑03 | M2 **accepted in writing** | Within the 7‑business‑day window ✓ |
| 2025‑06‑04 | **1,000 USDC paid** for M2 (on‑chain `Transfer`) | Correct order ✓ |
| 2025‑06‑15 | **M3 submitted** | Start of the 7‑business‑day acceptance clock for M3 |
| **2025‑06‑17** | ⚠️ **Northwind releases 500 USDC for M3** (on‑chain `Transfer`) | **No prior written acceptance of M3 on record** |
| 2025‑06‑20 | Northwind issues a **written rejection** of M3 (non‑conformance) | Within the 7‑business‑day window ✓ |
| 2025‑06‑23 | **Studio Kestrel opens the dispute**, disputing the 500 USDC | Claim opens |

**The crux:** the 500 USDC moved **before** any acceptance or rejection of M3. Per Clause 4.1,
payment should follow acceptance. Per Clause 4.2, the transfer alone is not acceptance. So
Northwind is in breach of the ordering clause *and* trying to claw back a payment it released
prematurely — while Kestrel argues the transfer itself constituted acceptance.

---

## 5 · The four evaluations — expected findings

Each maps to an existing or new deterministic check in `backend/src/proof/checks.ts`.
The agent emits **pass / fail / missing** findings and **turning questions** — it never
recommends or decides (enforced by `FORBIDDEN_VERDICT_KEYS` + `validateDraftFrame`).

### (a) Transaction happened — expected: **PASS**
Verify the **500 USDC `Transfer` event on Arc (2025‑06‑17)** exists and is finalised.
This is the existing on‑chain `verifyTransfer` path (C3 indexer + `chain/verifier.ts`).
→ The payment indisputably occurred.

### (b) Right order — expected: **FAIL** ← the load‑bearing finding
Clause 4.1 requires payment **after** acceptance.
- 500 USDC transferred: **2025‑06‑17**
- Written rejection issued: **2025‑06‑20**
- Prior written acceptance on record: **none**

A new **`paymentOrdering`** check compares the on‑chain payment timestamp against the
earliest acceptance/rejection timestamp for the milestone.
→ **FAIL: payment before acceptance — the wrong order.** This is what the reviewer must
weigh, and the point on which the two parties directly disagree.

### (c) Governing law — the agent **cites**, never decides
The agent surfaces the **top‑3 governing‑law pointers** for England & Wales (in
`northwind-kestrel-tos.md` §3) as authored, attributed, versioned references, and frames
one **turning question** against each. It states no conclusion. The reviewer alone reads
the pointers and decides.

### (d) ToS accordance — mixed
- **Clause 3.1** (7‑business‑day acceptance window): rejection issued within window → **compliant**.
- **Clause 4.1** (payment after acceptance): → **violated** (see (b)).
- **Clause 5.1** (48h cure): the check asks whether a cure window was *offered* before
  the written rejection — flagged as a question for the reviewer, not auto‑judged.
- **Clause 6.1** (correction only before deemed acceptance): depends on whether M3 was
  deemed accepted by 2025‑06‑24 (submission + 7 business days) — a timing question.

---

## 6 · What the reviewer must ultimately weigh (NOT the agent's call)

The agent never renders a verdict. The contested question, for the human reviewer, is:

> Did Northwind's premature release of the 500 USDC for M3 — before either accepting or
> rejecting M3 — defeat its later right to claw it back under Clause 4, given Kestrel's
> argument that the transfer itself was acceptance?

Everything the agent produces (findings, turning questions, the three law pointers) is in
service of that question. The four decision outcomes the reviewer may choose among are the
existing ones: `RECIPIENT_UPHELD`, `PLATFORM_UPHELD`, `PARTIAL_PLATFORM_UPHELD`,
`DISMISSED_INSUFFICIENT_EVIDENCE`.

---

## 7 · Round 2 — how this scenario will be wired into the live system

This round (Round 1) locks only the wording. Round 2 will:

- seed the M3‑relevant clauses (3.1, 4.1, 4.2, 5.1, 6.1) + the three law pointers as a new
  `PolicyClause` pack (`packRef: pack:northwind-kestrel-v1`), reusing the validated,
  append‑only, `jurisdiction`‑tagged pattern in `backend/src/seed/policy-pack.ts`;
- add a **`paymentOrdering`** check to `backend/src/proof/checks.ts` (fits the existing
  registry) → evaluation **(b)**;
- surface the **top‑3 pointers** as cited `clauseRef` findings / turning questions →
  evaluation **(c)**;
- render the pointers + the ordering finding in the CaseRoom law‑line card
  (`web/src/screens/v1/CaseRoom.tsx`).

The agent remains **keyless and verdict‑free** throughout — the existing guardrails enforce
that; no new authority is created.
