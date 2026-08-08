# ADR 0003 — Voluntary correction is separate from forced recovery

- **Status:** Accepted
- **Date:** 2026-08-04
- **Decides:** How the system treats errors and corrections to past records.
- **Partly superseded (demo scope only) by:** [ADR 0007 — Demo reinstates the arbiter-signed debt path (D3)](./0007-demo-debt-path-reinstated.md). ADR 0003's registrar posture is unchanged; only the legacy demo beat runs the debt path.

## Context

Two different problems are easy to conflate. (a) A record is wrong and a party
*wants* to correct it; (b) a party wants to *force* money back from another
party. Mixing them produces the worst of both: silent edits that destroy
auditability, dressed up as "recovery." The legacy narrative (see
`docs/LEGACY_NARRATIVE.md`) bundled these under escrow/arbiter-refund/debt.

## Decision

**Corrections are new records, never silent edits. Forced recovery is out of the
MVP. Voluntary correction is a distinct, opt-in path.**

- The immutable record (Payout, Evidence, Decision) is append-only at the model
  layer. You cannot rewrite a receipt or a decision; you add to it.
- Any money movement is a separate, opt-in act taken by a human signing with
  their own wallet against the Circle rail. Finné does not enforce it.
- Debt / clawback / future-payout deduction are capabilities of Circle's
  contract, **not** Finné MVP promises. They are documented as legacy rail
  behaviour, not marketed as product features.

## Consequences

- Append-only violations surface as HTTP **409** ("…is append-only: … Corrections
  are added as new records, never edits.").
- The product narrative never claims Finné can "claw back," "reverse," or
  "deduct from future payouts." Those words belong to the rail, not Finné.
- A recipient's right of reply and the permanence of the record are protected:
  nothing retroactively rewrites what either side was shown.

## Enforcement

- `appendOnly(schema, entity, immutablePaths)` plugin on Payout / Evidence /
  Decision via `pre('save'|'updateOne'|'findOneAndUpdate')` hooks.
- The README and PRD product claims are scoped to registration + evidence +
  anchoring; recovery language is confined to the legacy note.
