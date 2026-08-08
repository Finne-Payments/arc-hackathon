/* ============================================================================
   Northwind × Kestrel scenario policy pack (evaluation of: transaction
   happened / right order / governing law / ToS accordance).

   This is the seed for the locked scenario in docs/scenarios/. It is a
   SEPARATE pack from the demo Northstar pack — clause numbers are isolated
   per pack so citations stay unambiguous (the demo pack owns 4/7/9 and the
   demo tests cite them; this pack owns 31/41/42/51/61 + a 0-family of
   governing-law pointers).

   Mirrors the demo-pack contract exactly: authored offline, validated through
   the model-layer gate (validatePolicyClause + strict:'throw' + appendOnly),
   idempotent on boot, best-effort (never blocks boot). The governing-law
   pointers ride the existing clauseNumber===0 "law line" pattern — they are
   POINTERS the agent cites and frames turning questions against; they never
   recommend or decide (P6, enforced downstream by FORBIDDEN_VERDICT_KEYS).
   ========================================================================== */

import { generateId, validatePolicyClause } from "@finne/domain";
import { PolicyClause } from "../v1/models.ts";

export const NORTHWIND_PACK_REF = "pack:northwind-kestrel-v1";
export const NORTHWIND_JURISDICTION = "England & Wales";

/**
 * The scenario's Terms-of-Service clauses that the deterministic checks cite.
 * Clause numbers are unique WITHIN this pack (31/41/42/51/61) and disjoint
 * from the demo pack (4/7/9), so a finding's clauseRef + pack together name
 * exactly one clause.
 *
 * Text is abridged plain-language; the full text lives in
 * docs/scenarios/northwind-kestrel-tos.md. Authored offline (P10).
 */
const NORTHWIND_CLAUSES = [
  {
    clauseNumber: 31,
    text: "On submission of a milestone, the platform has seven (7) business days to accept or reject in writing; a rejection must state the specific non-conformance.",
    parameters: { days: 7 },
  },
  {
    clauseNumber: 41,
    text: "Payment for a milestone is released only after written acceptance of that milestone (or deemed acceptance under the acceptance clause).",
    parameters: {},
  },
  {
    clauseNumber: 42,
    text: "A USDC transfer for a milestone released before its acceptance is itself a breach of the order clause and does not, by itself, constitute acceptance.",
    parameters: {},
  },
  {
    clauseNumber: 51,
    text: "A rejected deliverable may be cured within forty-eight (48) hours; a timely cure is treated as on time.",
    parameters: { hours: 48 },
  },
  {
    clauseNumber: 61,
    text: "The platform may seek a correction of a payout only before the deliverable is deemed accepted, except in cases of fraud. The original payment is never reversed; a correction is a separate, recipient-authorised transfer.",
    parameters: {},
  },
];

/**
 * The governing-law pointers (top 3 for England & Wales) + a flagged services-
 * contract supplement. Each is its own clauseNumber===0 row so it renders in
 * the case room's law-line family with attribution + the not-legal-advice
 * disclaimer. The agent frames ONE turning question against each; it never
 * states a conclusion (the reviewer alone reads the pointers and decides).
 *
 * clauseNumber 0 marks a law line, not a numbered clause (same convention as
 * the demo pack). Multiple 0-rows form the law-line family.
 */
const NORTHWIND_LAW_LINES = [
  {
    text: "Common law of contract (England & Wales) governs formation, consideration, breach and remedies. A payment made before acceptance may be recoverable as total failure of consideration or as money had and received, subject to a change-of-position defence.",
    jurisdiction: NORTHWIND_JURISDICTION,
  },
  {
    text: "Sale of Goods Act 1979: where the supply includes goods, ss.13–15 imply terms as to description, satisfactory quality and fitness for purpose.",
    jurisdiction: NORTHWIND_JURISDICTION,
  },
  {
    text: "Unfair Contract Terms Act 1977: limitation terms (e.g. deemed-acceptance and 'payment before acceptance is not acceptance' clauses) are subject to the reasonableness test under s.11 / Schedule 2.",
    jurisdiction: NORTHWIND_JURISDICTION,
  },
  {
    // Flagged supplement — a content-production contract is on its face a
    // SERVICES contract, where SOGSA 1982 is the most directly applicable
    // statute. Surfacing it avoids a mis-fit when the agent cites the law.
    text: "Supply of Goods and Services Act 1982 (supplement — services limb): for the services component of the contract, s.13 (reasonable care and skill) and s.15 (time for performance) apply.",
    jurisdiction: NORTHWIND_JURISDICTION,
  },
];

/**
 * Seed the Northwind scenario pack if it isn't already present. Idempotent — a
 * repeated boot finds the pack and skips. Call from server boot (after DB
 * connect). Best-effort: a seed failure logs but never blocks boot.
 */
export async function seedNorthwindPack(): Promise<void> {
  try {
    const existing = await PolicyClause.countDocuments({ packRef: NORTHWIND_PACK_REF });
    if (existing > 0) return; // already seeded — idempotent

    const now = new Date().toISOString();
    // schemaVersion is a domain-envelope field (it gates validation), NOT a
    // Mongo field on v1_policy_clauses (the collection is strict:'throw', so an
    // unknown field aborts the whole insert). Destructure it out before insert.
    type ClauseRow = Omit<ReturnType<typeof validatePolicyClause>, "schemaVersion"> & { createdAt: string };
    const rows: ClauseRow[] = [];

    for (const c of NORTHWIND_CLAUSES) {
      // Validate through the model-layer gate BEFORE persist (same contract as
      // the demo pack). Strict parse rejects unknown keys; the verdict-key scan
      // rejects verdict-shaped fields. Runtime insertion cannot land unvalidated.
      const { schemaVersion: _sv, ...validated } = validatePolicyClause({
        schemaVersion: 1 as const,
        clauseId: generateId("clause"),
        packRef: NORTHWIND_PACK_REF,
        clauseNumber: c.clauseNumber,
        text: c.text,
        parameters: c.parameters,
        jurisdiction: NORTHWIND_JURISDICTION,
        author: "scenario", // scenario-authored (offline), with reviewRef
        reviewRef: "docs/scenarios/northwind-kestrel-tos.md",
        version: 1,
      });
      void _sv;
      rows.push({ ...validated, createdAt: now });
    }

    // The governing-law pointers go in as clauseNumber===0 rows (the law-line
    // family). They render with attribution + the not-legal-advice disclaimer
    // and are cited like clauses; the agent frames turning questions, never
    // conclusions.
    for (const law of NORTHWIND_LAW_LINES) {
      const { schemaVersion: _sv, ...validated } = validatePolicyClause({
        schemaVersion: 1 as const,
        clauseId: generateId("clause"),
        packRef: NORTHWIND_PACK_REF,
        clauseNumber: 0, // law-line family — not a numbered clause
        text: law.text,
        parameters: {},
        jurisdiction: law.jurisdiction,
        author: "scenario",
        reviewRef: "docs/scenarios/northwind-kestrel-tos.md",
        version: 1,
      });
      void _sv;
      rows.push({ ...validated, createdAt: now });
    }

    await PolicyClause.insertMany(rows);
    console.log(
      `[seed] northwind scenario pack inserted (${NORTHWIND_CLAUSES.length} clauses + ` +
        `${NORTHWIND_LAW_LINES.length} law pointers) — packRef ${NORTHWIND_PACK_REF}`,
    );
  } catch (e) {
    // Non-fatal: the case room renders without the pack, and clause checks
    // degrade to "missing" findings. The loop never depends on it.
    console.warn("[seed] northwind scenario pack seed failed (continuing):", e instanceof Error ? e.message : e);
  }
}

/**
 * Load the clause parameters for the scenario's deterministic checks. Returns
 * the grace-window hours (clause 51), acceptance window days (clause 31), and
 * deemed-acceptance days (also from clause 31) — with safe defaults if the pack
 * isn't seeded. Pure-ish read — called by frame assembly for scenario cases.
 */
export async function loadNorthwindClauseParameters(): Promise<{
  graceWindowHours: number;
  acceptanceWindowDays: number;
  deemedAcceptanceDays: number;
}> {
  const defaults = { graceWindowHours: 48, acceptanceWindowDays: 7, deemedAcceptanceDays: 7 };
  try {
    const c31 = await PolicyClause.findOne({ packRef: NORTHWIND_PACK_REF, clauseNumber: 31 });
    const c51 = await PolicyClause.findOne({ packRef: NORTHWIND_PACK_REF, clauseNumber: 51 });
    return {
      acceptanceWindowDays: c31?.parameters?.days ?? defaults.acceptanceWindowDays,
      deemedAcceptanceDays: c31?.parameters?.days ?? defaults.deemedAcceptanceDays,
      graceWindowHours: c51?.parameters?.hours ?? defaults.graceWindowHours,
    };
  } catch {
    return defaults;
  }
}
