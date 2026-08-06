/* ============================================================================
   Demo policy pack seed (FIN-110, FIN-111, FIN-112).

   The standard enters as evidence, not as model output (Addendum §F). The
   platform's payout terms are seeded as PolicyClause rows — authored offline,
   reviewed by a person, versioned (P10). Runtime insertion is rejected at the
   model layer (strict:'throw' + appendOnly).

   Demo clauses are fictional, plain-language, ≤ 3 sentences. The governing-law
   line is one authored sentence (Irish law) with attribution + a not-legal-
   advice disclaimer — A6 in miniature, the seed of the law library.

   Idempotent: safe to call on every boot. Existing clauses are left untouched.
   ========================================================================== */

import { generateId, validatePolicyClause } from "@finne/domain";
import { PolicyClause } from "../v1/models.ts";

export const DEMO_PACK_REF = "pack:demo-northstar-terms-v1";

/** The three demo clauses + the law line. Frozen content (FIN-111 sign-off). */
const DEMO_CLAUSES = [
  {
    clauseNumber: 4,
    text: "A deliverable submitted within 48 hours after its due date is treated as on time unless the platform rejects it in writing within that window.",
    parameters: { hours: 48 },
  },
  {
    clauseNumber: 7,
    text: "A deliverable not disputed within 14 days of submission is deemed accepted; accepted work is payable.",
    parameters: { days: 14 },
  },
  {
    clauseNumber: 9,
    text: "The platform may seek refund of a payout only before the deliverable is deemed accepted, except for fraud.",
    parameters: {},
  },
];

/**
 * The one-sentence Irish-law governing-law note (FIN-112). Authored by AG,
 * attributed, with the disclaimer rendered wherever the pack is cited. This is
 * the single law line — the seed of the law library, never generated at runtime.
 */
export const DEMO_LAW_LINE = {
  clauseNumber: 0, // 0 marks it as the law line, not a numbered clause
  text: "The contract is governed by Irish law; deemed-acceptance clauses of this kind are enforceable between businesses, and a clawback after acceptance is a contractual claim requiring grounds, not a self-help right.",
  parameters: {},
};

/**
 * Seed the demo policy pack if it isn't already present. Idempotent — a
 * repeated boot finds the pack by clauseNumber and skips. Call from server boot
 * (after DB connect). Best-effort: a seed failure logs but never blocks boot.
 */
export async function seedDemoPolicyPack(): Promise<void> {
  try {
    const existing = await PolicyClause.countDocuments({ packRef: DEMO_PACK_REF });
    if (existing > 0) return; // already seeded — idempotent

    const now = new Date().toISOString();
    // schemaVersion is a domain-envelope field (it gates validation), NOT a
    // Mongo field on v1_policy_clauses (the collection is strict:'throw', so an
    // unknown field aborts the whole insert). Destructure it out before insert.
    const rows = DEMO_CLAUSES.map((c) => {
      // FIN-110: validate through the model-layer gate BEFORE persist. Strict
      // parse rejects unknown keys; validateNoVerdictKeys rejects verdict fields.
      // Runtime insertion of an unvalidated/verdict-shaped clause cannot land.
      const { schemaVersion: _sv, ...validated } = validatePolicyClause({
        schemaVersion: 1 as const,
        clauseId: generateId("clause"),
        packRef: DEMO_PACK_REF,
        clauseNumber: c.clauseNumber,
        text: c.text,
        parameters: c.parameters,
        jurisdiction: "Ireland",
        author: "AG", // Arko (legal founder) — FIN-112 attribution
        reviewRef: "demo-pack-v1", // human-review reference
        version: 1,
      });
      void _sv;
      return { ...validated, createdAt: now };
    });

    // The law line goes in as its own clause row (clauseNumber 0) so it renders
    // in the case room with attribution + disclaimer, cited like a clause.
    const { schemaVersion: _lsv, ...lawValidated } = validatePolicyClause({
      schemaVersion: 1 as const,
      clauseId: generateId("clause"),
      packRef: DEMO_PACK_REF,
      clauseNumber: DEMO_LAW_LINE.clauseNumber,
      text: DEMO_LAW_LINE.text,
      parameters: DEMO_LAW_LINE.parameters,
      jurisdiction: "Ireland",
      author: "AG",
      reviewRef: "demo-pack-v1",
      version: 1,
    });
    void _lsv;
    rows.push({ ...lawValidated, createdAt: now });

    await PolicyClause.insertMany(rows);
    console.log(`[seed] demo policy pack inserted (${rows.length} clauses + law line) — packRef ${DEMO_PACK_REF}`);
  } catch (e) {
    // A seed failure is non-fatal: the case room renders without the pack, and
    // clause checks degrade to "missing" findings. The loop never depends on it.
    console.warn("[seed] demo policy pack seed failed (continuing):", e instanceof Error ? e.message : e);
  }
}

/**
 * Load clause parameters for the checks engine. Returns the grace-window hours
 * (clause 4) and acceptance-period days (clause 7), with safe defaults if the
 * pack isn't seeded. Pure-ish read — called by frame assembly.
 */
export async function loadClauseParameters(): Promise<{
  graceWindowHours: number;
  acceptancePeriodDays: number;
}> {
  const defaults = { graceWindowHours: 48, acceptancePeriodDays: 14 };
  try {
    const c4 = await PolicyClause.findOne({ packRef: DEMO_PACK_REF, clauseNumber: 4 });
    const c7 = await PolicyClause.findOne({ packRef: DEMO_PACK_REF, clauseNumber: 7 });
    return {
      graceWindowHours: c4?.parameters?.hours ?? defaults.graceWindowHours,
      acceptancePeriodDays: c7?.parameters?.days ?? defaults.acceptancePeriodDays,
    };
  } catch {
    return defaults;
  }
}
