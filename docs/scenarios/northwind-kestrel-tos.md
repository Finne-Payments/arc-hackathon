# Mock Terms of Service — Northwind Software Ltd. × Studio Kestrel

> **Master Services Agreement & Milestone Schedule v1.0**
> Companion to [`northwind-kestrel-dispute.md`](./northwind-kestrel-dispute.md).
>
> **Mock.** The parties are fictional. The clauses are written to give the Finné agentic
> layer real terms to evaluate — especially Clause 4 (Order of performance), which the M3
> dispute turns on. **Not legal advice.** Curated offline; intended to be seeded as a
> versioned, append‑only `PolicyClause` pack (`packRef: pack:northwind-kestrel-v1`).

---

## 1 · The agreement

### Parties
- **Northwind Software Ltd.** — a company registered in **England & Wales** — "Northwind"
  / "the Platform" (the *payer* seat).
- **Studio Kestrel** — a sole‑trader content & motion‑design studio — "Kestrel" / "the
  Studio" (the *recipient* seat).

### Scope
This Agreement governs milestone‑based content production, paid in **USDC on the Arc
network** (chain ID `5042002`).

---

## 2 · Clauses

> Clause numbers below (e.g. **3.1**, **4.1**) are the `clauseNumber` references the agent
> cites in findings and turning questions. They map onto the `PolicyClause` rows that Round 2
> will seed.

### 1. Scope & milestones
The Studio produces deliverables in four milestones:

- **M1** Brand kit + design brief — **700 USDC**
- **M2** Three explainer videos — **1,000 USDC**
- **M3** UI motion assets / hero animations — **500 USDC**
- **M4** Final handover pack — **300 USDC**

**Total: 2,500 USDC.**

### 2. Payment terms
- **2.1** All payments are made in **USDC on the Arc network** (chain ID `5042002`) to the
  Studio's designated wallet.
- **2.2** Each milestone amount is paid as a single transfer, identified by its **on‑chain
  `Transfer` event** and block timestamp. The chain is the source of truth for the payment.

### 3. Acceptance process
- **3.1** On submission of a milestone, Northwind has **seven (7) business days** to accept
  or reject **in writing**.
- **3.2** If Northwind neither accepts nor rejects in writing within seven business days,
  the milestone is **deemed accepted**; accepted work is payable.
- **3.3** A written rejection must state the **specific non‑conformance**.

### 4. Order of performance  ★ the clause the dispute turns on
- **4.1** Payment for a milestone is released **only after written acceptance** of that
  milestone (or deemed acceptance under 3.2).
- **4.2** A USDC transfer for a milestone released **before** its acceptance is itself a
  **breach** of this clause and **does not, by itself, constitute acceptance**.

### 5. Cure period
- **5.1** A rejected deliverable may be cured within **forty‑eight (48) hours**; a timely
  cure is treated as on time.

### 6. Refunds / corrections
- **6.1** Northwind may seek a **correction** of a payout **only before the deliverable is
  deemed accepted**, except in cases of fraud. The original payment is **never reversed**;
  a correction is a separate, recipient‑authorised transfer.

### 7. Governing law & disputes
- **7.1** This Agreement is **governed by the laws of England & Wales**.
- **7.2** Disputes are resolved under Northwind's dispute‑resolution process, which
  provides **both parties a right of reply**.

---

## 3 · Governing‑law pointers — top 3 for England & Wales

> These are **pointers**, not recommendations. Each is an **authored, attributed,
> versioned** reference ("Curated offline; not legal advice") that the agent surfaces so the
> reviewer can read the relevant law. The agent frames one **turning question** against each;
> **it never states a conclusion, never recommends, never decides.** This matches the
> existing `clauseNumber: 0` governing‑law‑line pattern in `backend/src/seed/policy-pack.ts`.

### Pointer 1 — Common law of contract (England & Wales)
> The common law governs formation, consideration, breach and remedies. A payment made
> before acceptance may be recoverable as **total failure of consideration** or as
> **money had and received**, subject to the Studio's **change‑of‑position** defence.
>
> *Turning question: which restitutionary route, if any, is in dispute — total failure of
> consideration, or money had and received — and does the Studio plead change of position?*

### Pointer 2 — Sale of Goods Act 1979
> Where the supply includes goods, **ss.13–15 SOGA 1979** imply terms as to **description,
> satisfactory quality and fitness for purpose**.
>
> *Turning question: is the M3 deliverable (UI motion assets) treated as goods, services,
> or both — and which implied terms therefore apply?*

### Pointer 3 — Unfair Contract Terms Act 1977
> Clauses 3.2 (deemed acceptance) and 4.2 (payment before acceptance is not acceptance)
> are **limitation terms** subject to the **UCTA 1977 reasonableness test** (s.11 /
> Schedule 2).
>
> *Turning question: is reasonableness itself contested, and on what evidence — i.e. was it
> fair and reasonable for the clause to allocate the risk of a premature transfer to the
> Studio?*

---

### Supplemental pointer (flagged — services contract)

> You asked for the **top 3 laws of contract** for the jurisdiction; the three above are
> those. This fourth is added and **clearly flagged** because a content‑production contract
> is, on its face, a **services** contract, where the statute below is the most directly
> applicable. Surfacing it now prevents a mis‑fit when the agent cites the law later.

**Supply of Goods and Services Act 1982** — for the **services** limb of the contract,
**s.13** (reasonable care and skill) and **s.15** (time for performance) apply.

*Turning question: which statutory regime — SOGA 1979 (goods) or SOGSA 1982 (services) —
governs the M3 deliverable, and does that affect the implied terms in dispute?*

---

## 4 · Round 2 — seeding map (not built this round)

When this wording is approved, Round 2 seeds the following `PolicyClause` rows under
`packRef: pack:northwind-kestrel-v1`, `jurisdiction: "England & Wales"`, reusing the
validated, append‑only pattern (`strict: "throw"` + `validatePolicyClause`):

| clauseNumber | Text (abridged) | Drives check |
|---|---|---|
| 0 (law line family) | Pointer 1 — Common law (E&W) | turning question |
| 0 (law line family) | Pointer 2 — Sale of Goods Act 1979 | turning question |
| 0 (law line family) | Pointer 3 — Unfair Contract Terms Act 1977 | turning question |
| 0 (supplemental) | SOGSA 1982 (services) — flagged | turning question |
| 3.1 | 7‑business‑day acceptance window | acceptance‑window check |
| 4.1 | Payment only after written acceptance | **`paymentOrdering`** (NEW) |
| 4.2 | Transfer before acceptance is not acceptance | **`paymentOrdering`** (NEW) |
| 5.1 | 48h cure period | cure‑offered check |
| 6.1 | Correction only before deemed acceptance | correction‑timing check |

The agent remains **keyless and verdict‑free**; the seeded pointers and clauses are cited
as findings and turning questions only.
