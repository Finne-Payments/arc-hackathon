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
 * The Irish governing-law notes (FIN-112). The seed of the law library —
 * authored by AG, signed off, frozen content. Each note is a plain-language
 * one-sentence statement of what the law provides (never what an arbiter should
 * conclude), with its citation living separately in sourceRefs. An empty
 * sourceRefs marks a settled common-law principle; an invented citation is
 * never permitted (see docs/law-lines-protocol.md).
 *
 * The order is load-bearing: binding force / incorporation → performance and
 * acceptance → breach and proof (the law-lines selection rule).
 */
export const DEMO_LAW_LINES = [
  {
    note: "law note 1",
    text: "Under Irish law, businesses are held to the written terms they agree, but a term generally binds only if it was set out, provided, or clearly identified to the other party when contracting — a bare 'terms available on request', or terms produced after the deal, is not enough.",
    jurisdiction: "Ireland",
    author: "Arko Ganguli (AG)",
    reviewRef: "FIN-112 · reviewed and approved by AG 2026-08-06",
    version: 1,
    sourceRefs: [
      {
        cite: "Noreside Construction Ltd v Irish Asphalt Ltd [2014] IESC 68",
        url: "https://www.bailii.org/ie/cases/IESC/2014/S68.html",
      },
    ],
  },
  {
    note: "law note 2",
    text: "Under Irish law, deemed-acceptance clauses of this kind are enforceable between businesses; a clawback after acceptance is a contractual claim requiring grounds, not a self-help right.",
    jurisdiction: "Ireland",
    author: "Arko Ganguli (AG)",
    reviewRef: "FIN-112 · authored 2026-08-03",
    version: 1,
    sourceRefs: [], // settled freedom-of-contract principle
  },
  {
    note: "law note 3",
    text: "Under Irish law, the party who alleges a breach of contract must prove it on the balance of probabilities — an enforceable contract, a failure to perform it, and a loss that resulted.",
    jurisdiction: "Ireland",
    author: "Arko Ganguli (AG)",
    reviewRef: "FIN-112 · reviewed and approved by AG 2026-08-06",
    version: 1,
    sourceRefs: [], // settled common law (civil standard of proof)
  },
] as const;

/** Rendered wherever the pack is cited (FIN-112). */
export const DEMO_LAW_DISCLAIMER =
  "Fictional demo terms. The law note is general information recorded by its author, not legal advice.";

/**
 * The single-line summary for the governing-law row (clauseNumber 0). The full
 * notes live in lawLines below; `text` is the one-line render for compact views.
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

    // The governing-law row (clauseNumber 0) carries the law library (lawLines)
    // + the disclaimer. It renders in the case room with attribution, its
    // reviewRef, a "see" pointer per sourceRef, and the disclaimer wherever the
    // pack is cited. NOTE: clauseNumber 0 now validates (the schema is
    // .nonnegative(), not .positive()) — a prior gate silently dropped this row
    // (and with it the whole seed) on every boot.
    const { schemaVersion: _lsv, ...lawValidated } = validatePolicyClause({
      schemaVersion: 1 as const,
      clauseId: generateId("clause"),
      packRef: DEMO_PACK_REF,
      clauseNumber: DEMO_LAW_LINE.clauseNumber,
      text: DEMO_LAW_LINE.text,
      parameters: DEMO_LAW_LINE.parameters,
      lawLines: DEMO_LAW_LINES.map((l) => ({
        note: l.note,
        text: l.text,
        jurisdiction: l.jurisdiction,
        author: l.author,
        reviewRef: l.reviewRef,
        version: l.version,
        sourceRefs: l.sourceRefs.map((s) => ({ cite: s.cite, url: s.url })),
      })),
      disclaimer: DEMO_LAW_DISCLAIMER,
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
