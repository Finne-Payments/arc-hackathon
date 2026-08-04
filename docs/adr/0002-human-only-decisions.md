# ADR 0002 — Decisions are human-only

- **Status:** Accepted
- **Date:** 2026-08-04
- **Decides:** Who (or what) may render a verdict in a Finné case.

## Context

A dispute resolution system that silently auto-decides erodes the one thing that
makes a dispute resolvable: a named human taking responsibility for the outcome,
in writing, on a record both sides can read. An AI that issued verdicts would
also concentrate risk and be impossible to hold accountable.

## Decision

**Every decision is made by a named human.** The Proof Agent reads and explains;
it never decides and never signs. There is no automatic-decision code path
anywhere in the product. The reviewer (a real person at the platform) reads the
shared case and the agent's findings-only brief, chooses the outcome, and — if a
refund is involved — signs the on-chain action from their own browser wallet.

## Consequences

- The agent brief schema has no recommendation/verdict/decision field. Verdict-
  shaped keys are rejected recursively at every depth → HTTP 422
  (`backend/src/findings.ts`).
- `POST /cases/:id/decisions` requires the `case:decide` permission (reviewer
  seat only) and a written reason of ≥ 20 characters.
- For a refund, the API returns an **unsigned** transaction; money moves only
  when the reviewer's wallet signs. The agent cannot reach the database or hold
  a key (ADR 0004).
- This keeps a person accountable and keeps the agent's output a *brief*, not a
  judgement.

## Enforcement

- Agent guardrail test bans signing/database imports; its dependency list is
  pinned to exactly `['@finne/domain']`.
- `case:decide` is reviewer-only in the RBAC matrix; the decision route requires
  a written reason (route + Mongo `minlength`).
- The agent brief Mongo schema is `strict:'throw'` as a second layer.
