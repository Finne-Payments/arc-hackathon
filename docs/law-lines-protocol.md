# Law-lines authoring protocol

**Status:** Process document (FIN-112). Model-agnostic — point any assistant (Claude, GLM, or otherwise) at this before it touches legal text.
**Scope:** Governs how governing-law notes ("law lines") are drafted, verified, and approved for Finné's policy packs. The three signed-off Irish notes live in `backend/src/seed/policy-pack.ts` (`DEMO_LAW_LINES`); the pending England & Wales drafts live in `docs/law-lines/pending-ew-drafts.md`.

Finné's Northwind × Kestrel scenario names governing law as one of four case evaluations, and the product stakes its credibility on the record. The law library behind that claim must be auditable: every line traceable to a verified primary source, every model-touched draft visibly pending human sign-off. This protocol is what makes legal text safe for a model to draft and cheap for a human to audit.

---

## The one rule that governs all others

**A model may draft law lines; only AG may author them.** Every model-touched draft leaves the workflow marked `PENDING AG SIGN-OFF` (`reviewRef: 'PENDING AG SIGN-OFF'`) and must never be presented as settled law or shipped in a frozen seed. This gate is the product's legal-credibility story — it is load-bearing, not ceremony.

---

## The twelve rules

1. **No citation from memory.** Never name a statute, section, case, or court unless verified *this working session* against an authoritative primary source. Model memory of law is not a source.
2. **Authoritative sources only.** Ireland: `irishstatutebook.ie`, `lawreform.ie`, `courts.ie`, `gov.ie`. England & Wales: `legislation.gov.uk`, `bailii.org` / `caselaw.nationalarchives.gov.uk`, `gov.uk`. Blogs, firm newsletters, and LLM output do not count.
3. **Verify the claim, not just the existence.** Open the source and confirm it provides what the line says; record URL and what was checked in the ledger.
4. **Plain line, separate citation.** The one-sentence line stays citation-free; citations live in `sourceRefs`. A wrong citation is worse than none; settled common-law principles carry an empty `sourceRefs`, never an invented one.
5. **No numbers without a primary source** — limitation periods, day counts, thresholds — and re-read for scope qualifiers before drafting.
6. **Scope honesty.** Consumer and B2B law diverge; every line states or clearly implies which relationship it covers.
7. **Neutrality.** A line describes what the law provides — never what the arbiter should conclude, never a party's conduct.
8. **Uncertainty is stated, never papered over.** Conflicting or partial verification → drop the line or mark it `PENDING AG SIGN-OFF — verification incomplete`. Such a line must not ship in a frozen seed.
9. **Ratio, not headline.** A case-anchored line may generalise no further than the *ratio decidendi* extracted from the primary text: the question framed, the material facts, the rule necessary for the outcome, every qualification preserved. Obiter licenses nothing.
10. **The refutation pass.** Before sign-off, actively search the primary text for passages that would falsify or narrow the draft; record the result in the ledger.
11. **Quantifier discipline.** Every "only if / never / must / always" must map to an equally universal statement in the ratio; otherwise weaken to the court's own hedge. The judgment's hedges are load-bearing.
12. **Precedent hierarchy (stare decisis).** Where the applicable law recognises stare decisis, look first for the ratio of the highest court to have decided the point; a higher court's ratio trumps a lower court's, and a line must never rest on a holding a higher court has overruled, doubted, or narrowed. In parallel state/federal systems, resolve conflicts by that jurisdiction's own established rule (e.g. the doctrine of repugnancy, or supremacy/pre-emption) — never by picking the friendlier authority. Record each cited court's place in the hierarchy in the ledger.

---

## Selection rule (top-N notes cover)

A pack's top-N law notes cover three evaluations, in this order — and the order is load-bearing:

1. **Binding force / incorporation** — that agreed written terms govern.
2. **Performance and acceptance** — how the law treats delivery, acceptance, deemed acceptance.
3. **Breach, proof and remedies** — burden and civil standard of proof; recovery of a paid sum as a claim needing grounds.

Each note is mapped to the clause(s) it illuminates (the platform's payout terms it bears on).

For England & Wales specifically (rule 12 applied): prefer the ratio of the UK Supreme Court (or House of Lords for older authority), then the Court of Appeal, then the High Court; check that nothing cited has been overruled or doubted above. Verification sources: `legislation.gov.uk`, `bailii.org`, `caselaw.nationalarchives.gov.uk`.

---

## Sign-off protocol

Drafts are presented for review with:

- **The verification trail** — for each `sourceRef`, the primary-source URL and what was checked.
- **Clause mapping** — which platform clause(s) the note illuminates.
- For case-anchored lines: **a claim-to-passage map** (which passages of the judgment support each clause of the one-sentence line), plus **the refutation-pass result** (passages searched that could falsify/narrow it, and the outcome).

Only AG may change `reviewRef` from `PENDING AG SIGN-OFF` to a signed-off reference. A signed-off note may then move into the frozen seed (`DEMO_LAW_LINES` in `backend/src/seed/policy-pack.ts`).

---

## The law-line shape

Defined in `packages/domain/src/schemas.ts` (`lawLineSchema`) and mirrored in the Mongoose schema (`backend/src/v1/models.ts`):

```ts
{
  note: string;          // human label, e.g. "law note 1"
  text: string;          // one plain-language sentence — no inline citation
  jurisdiction: string;  // e.g. "Ireland"
  author: string;        // who authored it (offline); never a model name
  reviewRef: string;     // human-review reference; "PENDING AG SIGN-OFF" until approved
  version: number;       // positive integer
  sourceRefs: {          // empty array is valid for settled common-law principles
    cite: string;        // citation as it appears on the primary source
    url: string;         // the primary source opened during verification
  }[];
}
```

Note: `verdict`-shaped keys (`verdict`, `liability`, `outcome`, `decision`, `award`, `penalty`, …) are rejected at any depth by `validateNoVerdictKeys` — a law line is neutral description, never a conclusion.
