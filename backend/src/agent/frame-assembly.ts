/* ============================================================================
   FIN-124 / FIN-127 / FIN-133 — frame assembly.

   Composes a DraftFrame from three sources with a 3-rung degrade ladder:
     rung 0 (full):        requirements (templates) + unresolved (computed) + questions (model)
     rung 1 (no questions): requirements + unresolved (model degraded)
     rung 2 (no frame):     requirements + unresolved both empty (total failure)

   Requirements (templates) and unresolved (computed) NEVER need the model, so
   they always succeed — the frame can always reach at least rung 1. Only the
   turning questions need the model; on their failure the frame degrades to
   rung 1, never blocks the decision (P8).

   Stamps modelDigest + a per-line provenance flag (FIN-133). The frame is
   validated through validateDraftFrame before persist — the licence to render.

   Per-line reviewer actions (accept/edit/discard) are logged separately by the
   route handler via recordHumanAction (FIN-127).
   ========================================================================== */

import { generateId, validateDraftFrame, type DraftFrame } from "@finne/domain";
import { DraftFrame as DraftFrameModel } from "../registrar/models.ts";
import { runChecks, type CheckInput, type CheckResult } from "../proof/checks.ts";
import { fillOutcomeRequirements } from "./frame-templates.ts";
import { computeUnresolved, type UnresolvedInput } from "./frame-unresolved.ts";
import { phraseTurningQuestions } from "./frame-questions.ts";
import { generateNarrative } from "./narrative.ts";
import { isModelEnabled } from "./model-client.ts";
import { loadEnv } from "../env.ts";

/**
 * Citation depth per party (FIN-126). A STRUCTURAL count of references, never a
 * score. Findings (per-deliverable, citing clauses) are neutral — both parties
 * get equal credit. Unresolved items partition by kind:
 *   - missing_written_rejection  → platform (the platform's obligation under c4)
 *   - unanswered_reply            → recipient (the recipient failed to respond)
 *   - uncountered_evidence        → both (one side didn't counter the other)
 *   - contested_amount_mismatch   → both
 *   - absent_acceptance_criteria  → both
 * Symmetric by construction; the count never weighs material.
 *
 * Exported for the symmetry test (FIN-126): both parties' depth must be balanced
 * — the frame must not quietly enrich one side's material.
 */
export function computeCitationDepth(
  findings: CheckResult[],
  unresolved: { kind: string; refs: string[] }[],
): { platform: number; recipient: number } {
  // Findings: each clause-cited finding is one neutral reference → counts for both.
  const findingRefs = new Set(
    findings.filter((f) => f.clauseRef).map((f) => f.checkId),
  ).size;

  let platformExtras = 0;
  let recipientExtras = 0;
  for (const u of unresolved) {
    if (u.kind === "missing_written_rejection") platformExtras += u.refs.length;
    else if (u.kind === "unanswered_reply") recipientExtras += u.refs.length;
    else {
      // uncountered_evidence / contested_amount_mismatch / absent_acceptance_criteria
      // → counts for both (a gap both sides must address).
      platformExtras += u.refs.length;
      recipientExtras += u.refs.length;
    }
  }
  return { platform: findingRefs + platformExtras, recipient: findingRefs + recipientExtras };
}

export interface FrameAssemblyInput {
  caseId: string;
  claimType: string;
  caseContext: string; // short human summary for the model (parties, allegation)
  checkInput: CheckInput;
  unresolvedInput: UnresolvedInput;
  /**
   * Optional progress callback for the UI/status layer. Fired at the start of
   * each named stage with its outcome. Never throws (the caller wraps it).
   * Used by the case room to surface "agents running" per-stage status.
   */
  onStage?: (stage: "proof_checks" | "turning_questions" | "narrative" | "assemble", status: "done" | "degraded") => void;
}

export interface FrameAssemblyResult {
  /** The frame, or null at rung 2 (total degrade — no usable record). */
  frame: DraftFrame | null;
  /** Persisted Mongo doc id (frameId). Null at rung 2. */
  frameId: string | null;
  /** 0=full, 1=no questions, 2=no frame. */
  degradeLevel: number;
  /** Narrative summary, null if degraded. */
  narrative: string | null;
}

/**
 * Assemble, validate, and persist a DraftFrame. Three degrade rungs (FIN-124):
 *   rung 0 (full):         requirements + unresolved + questions
 *   rung 1 (no questions): requirements + unresolved (model degraded)
 *   rung 2 (no frame):     total degrade — no usable record, frame is null
 *
 * Never throws. A total failure degrades to rung 2 (null frame); the case room
 * renders the v1 reason box unaided, exactly as if the agent didn't exist.
 */
export async function assembleFrame(input: FrameAssemblyInput): Promise<FrameAssemblyResult> {
  let findings: import("../proof/checks.ts").CheckResult[] = [];
  let findingsSummary = "";
  let requirements: import("./frame-templates.ts").FilledRequirement[] = [];
  let unresolved: import("./frame-unresolved.ts").UnresolvedItem[] = [];

  // --- Deterministic parts (no model) — may throw on malformed input -------
  // Rung 2 is reached only when BOTH deterministic parts fail to produce
  // anything usable. Each is wrapped so a throw degrades rather than crashes.
  try {
    findings = runChecks(input.checkInput);
    findingsSummary = findings
      .map((f) => `${f.check}: ${f.result} (${f.found})`)
      .join("; ");
    requirements = fillOutcomeRequirements(input.claimType, findings);
    unresolved = computeUnresolved(input.unresolvedInput);
    input.onStage?.("proof_checks", "done");
  } catch (e) {
    console.warn("[frame-assembly] deterministic stage failed — degrading:", e instanceof Error ? e.message : e);
    input.onStage?.("proof_checks", "degraded");
  }

  // --- Rung 2 gate: if there is no usable record (no requirements AND no
  // unresolved), there is nothing to frame. Return null; do not persist.
  if (requirements.length === 0 && unresolved.length === 0) {
    console.warn(`[frame-assembly] rung 2 for case ${input.caseId} — no usable record, frame null`);
    return { frame: null, frameId: null, degradeLevel: 2, narrative: null };
  }

  // --- Questions (model) — may degrade to empty ---------------------------
  const { questions, degraded: questionsDegraded } = await phraseTurningQuestions(
    input.caseContext,
    findings,
  );
  input.onStage?.("turning_questions", questionsDegraded ? "degraded" : "done");

  // --- Narrative (model) — may degrade ----------------------------------
  const narrativeRes = await generateNarrative(input.caseContext, findingsSummary);
  input.onStage?.("narrative", narrativeRes.degraded ? "degraded" : "done");

  // --- Determine degrade rung -------------------------------------------
  const degradeLevel = questionsDegraded ? 1 : 0;

  const env = loadEnv();
  const modelDigest = isModelEnabled()
    ? { model: env.model.name, id: env.model.name, digest: env.model.digest ?? "unpinned" }
    : null; // null when models-unplugged (FIN-105)

  const frameId = generateId("frame");
  // --- Citation depth per party (FIN-126) — structural count, never a score.
  // Findings are neutral (per-deliverable, citing clauses): both parties get
  // equal credit for each finding. Unresolved items are partitioned by kind:
  // missing_written_rejection → platform; unanswered_reply/uncountered_evidence
  // → the side that failed to respond/counter. The COUNT is symmetric by
  // construction; it never weighs the material.
  const citationDepth = computeCitationDepth(findings, unresolved);
  const rawFrame: DraftFrame = {
    schemaVersion: 1,
    frameId,
    caseId: input.caseId,
    questions,
    requirements,
    unresolved,
    citationDepth,
    modelDigest,
    generatedAt: new Date().toISOString(),
  };

  // --- Validate (the licence to render — FIN-126 depends on this) --------
  const validated = validateDraftFrame(rawFrame);

  // --- Persist (append-only) --------------------------------------------
  await DraftFrameModel.create({
    frameId: validated.frameId,
    caseId: validated.caseId,
    questions: validated.questions,
    requirements: validated.requirements,
    unresolved: validated.unresolved,
    citationDepth: validated.citationDepth,
    modelDigest: validated.modelDigest,
    generatedAt: validated.generatedAt,
    degradeLevel,
    createdAt: new Date().toISOString(),
  });
  input.onStage?.("assemble", "done");

  console.log(
    `[frame-assembly] frame ${frameId} for case ${input.caseId} — rung ${degradeLevel} ` +
      `(${questions.length} questions, ${requirements.length} requirements, ${unresolved.length} unresolved)`,
  );

  return {
    frame: validated,
    frameId,
    degradeLevel,
    narrative: narrativeRes.text,
  };
}

/** Fetch the latest frame for a case (for the GET route + case detail). */
export async function getLatestFrame(caseId: string): Promise<DraftFrame | null> {
  const doc = await DraftFrameModel.findOne({ caseId }).sort({ createdAt: -1 }).lean();
  if (!doc) return null;
  return {
    schemaVersion: 1,
    frameId: doc.frameId,
    caseId: doc.caseId,
    questions: doc.questions as DraftFrame["questions"],
    requirements: doc.requirements as DraftFrame["requirements"],
    unresolved: doc.unresolved as DraftFrame["unresolved"],
    citationDepth: (doc.citationDepth as DraftFrame["citationDepth"]) ?? { platform: 0, recipient: 0 },
    modelDigest: doc.modelDigest as DraftFrame["modelDigest"],
    generatedAt: doc.generatedAt,
  };
}
