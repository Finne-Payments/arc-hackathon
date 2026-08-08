# England & Wales governing-law notes — DRAFTS (PENDING AG SIGN-OFF)

**Status:** All three notes are **drafts**. `reviewRef` is `PENDING AG SIGN-OFF`. They are **not** in the frozen seed and must not be presented as settled law. Drafted by a model (GLM) following `docs/law-lines-protocol.md`; only AG may author them.
**Scenario:** Northwind (platform) × Kestrel (recipient/creator) — a B2B commercial dispute over a paid deliverable. Governing law: England & Wales.
**Selection rule:** binding force/incorporation → performance & acceptance → breach, proof & remedies.

> If sign-off does not happen before the demo, demo with the Irish pack's notes (the frozen seed) and these E&W notes visibly marked pending.

---

## Verification ledger

Every citation below was **opened against a primary source this session** (2026-08-07). Model memory of law is not a source; nothing here is cited from memory. Two honesty flags are carried into the notes themselves: (i) note 2's authority is a *goods* statute and needs a services/digital-content caveat; (ii) note 1 is framed as objective-agreement governs incorporation, not a mechanical "signed-terms-win" rule.

| Note | Principle | Authority | Primary source (verified) | Court / level |
|---|---|---|---|---|
| 1 | Binding force / incorporation | RTS Flexible Systems Ltd v Molkerei Alois Müller GmbH & Co KG [2010] UKSC 14 | https://www.bailii.org/uk/cases/UKSC/2010/14.html | UK Supreme Court |
| 2 | Performance / acceptance of goods | Sale of Goods Act 1979, s.35 | https://www.legislation.gov.uk/ukpga/1979/54/section/35 | Statute (goods regime) |
| 3a | Civil standard of proof | Re B (Children) [2008] UKHL 35 | https://www.bailii.org/uk/cases/UKHL/2008/35.html | House of Lords |
| 3b | Recovery of a paid sum needs grounds | Lipkin Gorman (a firm) v Karpnale Ltd [1988] UKHL 12 (= [1991] 2 AC 548) | https://www.bailii.org/uk/cases/UKHL/1988/12.html | House of Lords |

### What was checked

- **RTS [2010] UKSC 14** — Confirmed on BAILII header; Lord Clarke opens with *"whether there is a binding contract between the parties and, if so, upon what terms depends upon what they have agreed"* and frames it as an objective assessment of communicated agreement. The case is the leading modern E&W authority on battle-of-the-forms/contract formation; it narrows (not endorses) the old "last shot wins" rule. Honesty flag: framed as objective agreement, not "signed terms always win."
- **SGA 1979 s.35** — Confirmed on legislation.gov.uk. s.35(2)–(3): a buyer is *deemed to have accepted* goods after intimating acceptance, or after a *reasonable time* without intimating rejection; s.35(5): not before a *reasonable opportunity to examine*. On acceptance, the right to reject is lost (remedy reduces to damages). **Caveat carried into the note:** this is the *goods* regime; a creator deliverable that is a service or digital content turns primarily on the agreed contract terms (and potentially the Supply of Goods and Services Act 1982), not SGA 1979.
- **Re B [2008] UKHL 35** — Confirmed on BAILII. Lord Hoffmann: *"there is only one civil standard of proof and that is proof that the fact in issue more probably occurred than not."* Baroness Hale: neither the seriousness of the allegation nor of the consequences changes the standard. This is the canonical modern E&W authority on the civil standard.
- **Lipkin Gorman [1988] UKHL 12** — Confirmed on BAILII (header, parties, speeches). House of Lords recognising unjust enrichment as the basis for recovering money paid; Lord Goff on the change-of-position defence. Confirms recovery of a paid sum is itself a claim requiring a recognised legal ground, not self-help. (The near-identical `…/UKHL/1991/12.html` is a *different* case — *R v R* — and was rejected.) The more recent structural restatement is *Test Claimants in the FII Group Litigation* [2020] UKSC 47, **not** re-fetched this session, so it is not cited here.

### Refutation pass (rule 10)

- **RTS:** searched for a holding that signed terms *nevertheless* fail to bind where conduct is equivocal — the case in fact supports that finding (Clause 48 / "subject to contract" did not prevent a contract where conduct was unequivocal). The objective-agreement framing survives; a "signed terms always bind" framing would overclaim and was rejected.
- **SGA s.35:** searched s.35(4)–(6) for limits on deemed acceptance (repair/examination, sale-on-approval) — reflected in the "reasonable examination" qualifier in the note.
- **Re B:** searched for an exception raising the standard for serious allegations — Baroness Hale expressly rejects one; the note's "balance of probabilities" statement survives without a seriousness carve-out.
- **Lipkin Gorman:** searched for a self-help recovery path — none recognised; the change-of-position *defence* confirms recovery is a claim, not a clawback. Caveat added: where a valid contract exists, restitution is subject to it (typically total failure of consideration).

---

## Note 1 — Binding force / incorporation (DRAFT)

```yaml
note: "law note 1 (E&W)"
text: "Under the law of England & Wales, a contract between businesses is formed on what they objectively agreed — by words or conduct — and the agreed written terms govern; neither party is bound by terms the other did not agree or incorporate."
jurisdiction: "England & Wales"
author: "Curator (draft for AG review)"
reviewRef: "PENDING AG SIGN-OFF"
version: 1
sourceRefs:
  - cite: "RTS Flexible Systems Ltd v Molkerei Alois Müller GmbH & Co KG [2010] UKSC 14"
    url: "https://www.bailii.org/uk/cases/UKSC/2010/14.html"
# Illuminates: the platform's payout terms (what the recipient agreed to).
```

## Note 2 — Performance and acceptance (DRAFT)

```yaml
note: "law note 2 (E&W)"
text: "Under the law of England & Wales, a buyer who has had a reasonable opportunity to examine goods is deemed to have accepted them after a reasonable time, and the right to reject is lost on acceptance; this is the default rule for a sale of goods — where the deliverable is a service or digital content, the position turns primarily on the agreed contract terms, not on this statute."
jurisdiction: "England & Wales"
author: "Curator (draft for AG review)"
reviewRef: "PENDING AG SIGN-OFF"
version: 1
sourceRefs:
  - cite: "Sale of Goods Act 1979, s.35"
    url: "https://www.legislation.gov.uk/ukpga/1979/54/section/35"
# Illuminates: the deemed-acceptance window (the scenario's "right order" crux).
```

## Note 3 — Breach, proof and remedies (DRAFT)

```yaml
note: "law note 3 (E&W)"
text: "Under the law of England & Wales, the party who alleges a breach of contract must prove it on the balance of probabilities — the single civil standard — and recovering a sum already paid is itself a claim that requires a recognised legal ground (such as total failure of consideration), not a self-help reversal."
jurisdiction: "England & Wales"
author: "Curator (draft for AG review)"
reviewRef: "PENDING AG SIGN-OFF"
version: 1
sourceRefs:
  - cite: "Re B (Children) [2008] UKHL 35"
    url: "https://www.bailii.org/uk/cases/UKHL/2008/35.html"
  - cite: "Lipkin Gorman (a firm) v Karpnale Ltd [1988] UKHL 12"
    url: "https://www.bailii.org/uk/cases/UKHL/1988/12.html"
# Illuminates: burden/standard of proof and the limits on clawing back a payout.
```
