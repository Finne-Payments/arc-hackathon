/* ============================================================================
   Zod schemas — shared runtime validation for request bodies and domain
   envelopes. Backend and (where needed) web import these so validation rules
   cannot diverge (BE-03 canonical envelopes, AGENT-01 fact-pack schema).
   ========================================================================== */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/** Micro-USDC as a string of digits (no decimals, no sign). */
export const microUsdcSchema = z
  .string()
  .regex(/^\d+$/, "Amount must be a micro-USDC digit string.")
  .refine((v) => {
    try {
      return BigInt(v) > 0n;
    } catch {
      return false;
    }
  }, { message: "Amount must be positive." });

/** EVM address — 0x-prefixed, 40 hex chars (case-insensitive). */
export const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address.");

/** Transaction hash — 0x-prefixed, 64 hex chars. */
export const txHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash.");

/** keccak256 hash — 0x-prefixed, 64 hex chars. */
export const keccakHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid keccak256 hash.");

/** sha256 hex — 64 hex chars (no 0x). */
export const sha256Schema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, "Invalid sha256 hash.");

/** Reason text — min 20 chars (DEC-01). */
export const reasonSchema = z.string().trim().min(20, "Reason must be at least 20 characters.");

/** Idempotency key header. */
export const idempotencyKeySchema = z.string().min(8, "Idempotency-Key required for retryable writes.").max(256);

/* -------------------------------------------------------------------------- */
/* Canonical envelopes (BE-03)                                                 */
/* -------------------------------------------------------------------------- */

/** Receipt envelope — the canonical record anchored on chain. */
export const receiptEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  paymentId: z.string(),
  chainId: z.number().int().positive(),
  txHash: txHashSchema,
  payer: evmAddressSchema,
  recipient: evmAddressSchema,
  token: evmAddressSchema,
  amountMicroUsdc: microUsdcSchema,
  paidAt: z.string().datetime(),
  items: z.array(
    z.object({
      label: z.string(),
      amountMicroUsdc: microUsdcSchema,
    }),
  ),
  policyVersion: z.string(),
  policyHash: keccakHashSchema,
  receiptHash: keccakHashSchema.optional(), // filled after canonicalization
});

/** Claim envelope — frozen at case open (CASE-01). */
export const claimEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.string(),
  paymentId: z.string(),
  claimType: z.string(),
  allegation: z.string(),
  challengedAmountMicroUsdc: microUsdcSchema,
  responseDueAt: z.string().datetime(),
  policyVersion: z.string(),
  openedAt: z.string().datetime(),
  openedBy: z.string(),
  citedEvidenceIds: z.array(z.string()),
  claimHash: keccakHashSchema.optional(),
});

/** Response envelope — frozen at recipient submit (CASE-02). */
export const responseEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.string(),
  text: z.string(),
  evidenceIds: z.array(z.string()),
  submittedAt: z.string().datetime(),
  submittedBy: evmAddressSchema,
  responseHash: keccakHashSchema.optional(),
});

/** Decision envelope (DEC-01). */
export const decisionEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.string(),
  outcome: z.enum([
    "RECIPIENT_UPHELD",
    "PLATFORM_UPHELD",
    "PARTIAL_PLATFORM_UPHELD",
    "DISMISSED_INSUFFICIENT_EVIDENCE",
  ]),
  rationale: reasonSchema,
  correctionAmountMicroUsdc: microUsdcSchema.optional(),
  decidedAt: z.string().datetime(),
  decidedBy: z.string(),
  decidedByWallet: evmAddressSchema,
  decisionHash: keccakHashSchema.optional(),
});

/** Correction instruction envelope (COR-01). */
export const correctionInstructionEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  correctionId: z.string(),
  caseId: z.string(),
  paymentId: z.string(),
  decisionId: z.string(),
  recipient: evmAddressSchema,
  destination: evmAddressSchema,
  token: evmAddressSchema,
  chainId: z.number().int().positive(),
  amountMicroUsdc: microUsdcSchema,
  expiresAt: z.string().datetime(),
  instructionHash: keccakHashSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Agent fact-pack schema (AGENT-01) — non-verdict, citation-bound            */
/* -------------------------------------------------------------------------- */

const citationSchema = z.object({
  sourceId: z.string(),
  sourceHash: keccakHashSchema,
  sourceVersion: z.string(),
  field: z.string().optional(),
});

export const agentFactPackSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.string(),
  agentVersion: z.object({
    model: z.string(),
    prompt: z.string(),
    tool: z.string(),
    schema: z.string(),
    deterministicCheckVersion: z.string(),
    inputBundleHash: keccakHashSchema,
  }),
  verifiedFacts: z.array(
    z.object({
      statement: z.string(),
      citations: z.array(citationSchema).min(1, "Every material fact needs at least one citation."),
      deterministic: z.boolean().default(true),
    }),
  ),
  partyClaims: z.array(
    z.object({
      party: z.enum(["platform", "recipient"]),
      statement: z.string(),
      citations: z.array(citationSchema),
    }),
  ),
  chronology: z.array(
    z.object({
      event: z.string(),
      timestamp: z.string(),
      citations: z.array(citationSchema).min(1),
    }),
  ),
  calculations: z.array(
    z.object({
      label: z.string(),
      expression: z.string(),
      result: z.string(),
      citations: z.array(citationSchema),
    }),
  ),
  contradictions: z.array(
    z.object({
      description: z.string(),
      citations: z.array(citationSchema).min(1),
    }),
  ),
  missingEvidence: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  limitations: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  // FORBIDDEN — validator rejects these keys at any depth (AGENT-01 step 4)
});

/**
 * Validate that a fact-pack object contains no verdict-shaped keys at any
 * depth. Throws on forbidden language. This is the hard guardrail (P1/AGENT-01).
 */
const FORBIDDEN_VERDICT_KEYS = [
  "verdict",
  "liability",
  "fraud",
  "recommendedoutcome",
  "recommended_outcome",
  "transferinstruction",
  "transfer_instruction",
  "decision",
  "outcome",
  "guilty",
  "award",
  "penalty",
];

export function validateNoVerdictKeys(obj: unknown, path = ""): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => validateNoVerdictKeys(item, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_VERDICT_KEYS.includes(lowerKey)) {
      throw new Error(`Forbidden verdict-shaped key "${key}" at ${path || "root"}. The Proof Agent may not render a verdict.`);
    }
    // Also scan string values for explicit verdict directives
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      if (lower.includes("i find in favor of") || lower.includes("the agent concludes that the recipient is liable")) {
        throw new Error(`Forbidden verdict language in "${key}" at ${path || "root"}.`);
      }
    }
    validateNoVerdictKeys(value, path ? `${path}.${key}` : key);
  }
}

/**
 * Keys banned specifically on a DraftFrame (Addendum §H): the frame is
 * "attention, not conclusion" (P6), so any ranking/score/confidence field is a
 * defect even though it isn't a verdict per se. Used by validateDraftFrame().
 *
 * NOTE: the structural field names `outcome` and `decision` are deliberately
 * EXCLUDED here. The Addendum §H DraftFrame spec requires `requirements[]
 * (outcome, template id, filled params)`, and §E.1 states outcome-requirement
 * lines are "safe to name outcomes" precisely because they are template-authored
 * (provenance: "template", enforced by the schema). What is banned is the frame
 * SCORING or RANKING outcomes, or declaring one correct — caught by the terms
 * below plus the conclusion-language scan.
 */
const FORBIDDEN_FRAME_KEYS = [
  ...FORBIDDEN_VERDICT_KEYS.filter((k) => k !== "outcome" && k !== "decision"),
  "score",
  "ranking",
  "rank",
  "confidence",
  "weight",
  "preference",
  "winner",
  "loser",
  "stronger",
  "weaker",
  "favor",
  "favour",
];

/**
 * Validate a DraftFrame: run the schema, then recursively reject any verdict /
 * score / confidence / ranking key or banned language. This is the licence to
 * render the frame at all (FIN-126 symmetry test depends on this being strict).
 *
 * The scan runs against the RAW input (before zod strips unknown keys) so that
 * smuggled banned keys are caught even if the schema would discard them.
 */
export function validateDraftFrame(obj: unknown): DraftFrame {
  // 1. Scan the raw input FIRST — catches banned keys the model might smuggle
  //    that zod would otherwise silently strip on .parse().
  const scan = (node: unknown, p: string): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => scan(item, `${p}[${i}]`));
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (FORBIDDEN_FRAME_KEYS.includes(lowerKey)) {
        throw new Error(
          `Forbidden frame key "${key}" at ${p || "root"}. The frame directs attention; it never scores, ranks, or marks an outcome correct (P6).`,
        );
      }
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (
          lower.includes("i find in favor of") ||
          lower.includes("the agent concludes that the recipient is liable") ||
          lower.includes("the stronger case") ||
          lower.includes("should be upheld") ||
          lower.includes("the correct outcome is")
        ) {
          throw new Error(`Forbidden conclusion language in "${key}" at ${p || "root"}.`);
        }
      }
      scan(value, p ? `${p}.${key}` : key);
    }
  };
  scan(obj, "");
  // 2. Then parse — structural validation + defaulting (provenance flags etc.).
  return draftFrameSchema.parse(obj);
}

export type ReceiptEnvelope = z.infer<typeof receiptEnvelopeSchema>;
export type ClaimEnvelope = z.infer<typeof claimEnvelopeSchema>;
export type ResponseEnvelope = z.infer<typeof responseEnvelopeSchema>;
export type DecisionEnvelope = z.infer<typeof decisionEnvelopeSchema>;
export type CorrectionInstructionEnvelope = z.infer<typeof correctionInstructionEnvelopeSchema>;
export type AgentFactPack = z.infer<typeof agentFactPackSchema>;

/* -------------------------------------------------------------------------- */
/* Agent layer records (PRD Addendum A §H / FIN-130)                           */
/*                                                                            */
/* Four typed records, defined now (including post-hackathon ones) so corpus  */
/* logging is uniform from day one. Every model-touched record is run through */
/* validateNoVerdictKeys() before render — the clerk prepares, never decides. */
/* Banned fields per record are enforced by the validators below.             */
/* -------------------------------------------------------------------------- */

/** Model-digest stamp — provenance for any model-touched line (FIN-133). */
const modelDigestSchema = z.object({
  model: z.string(), // e.g. "gpt-oss-20b" — config only, never a model name in call sites
  id: z.string(), // served-model id
  digest: z.string(), // pinned digest (FIN-100)
});

/**
 * DraftFrame (FIN-120, Addendum A4) — the verdict-free replacement for a draft
 * verdict. Three parts: turning questions (model-phrased), outcome requirements
 * (template-authored, no model), unresolved items (computed). Stored SEPARATE
 * from the AgentBrief: briefs carry findings, frames live with the decider.
 *
 * BANNED: any verdict, score, confidence, or outcome-ranking field. Provenance
 * is carried per-line so the post-filter (FIN-103) knows which lines it polices.
 */
export const draftFrameSchema = z.object({
  schemaVersion: z.literal(1),
  frameId: z.string(),
  caseId: z.string(),
  questions: z.array(
    z.object({
      text: z.string(),
      findingRefs: z.array(z.string()),
      provenance: z.enum(["template", "computed", "model"]).default("model"),
    }),
  ),
  requirements: z.array(
    z.object({
      outcome: z.enum([
        "RECIPIENT_UPHELD",
        "PLATFORM_UPHELD",
        "PARTIAL_PLATFORM_UPHELD",
        "DISMISSED_INSUFFICIENT_EVIDENCE",
      ]),
      templateId: z.string(),
      filledParams: z.record(z.string(), z.string()),
      provenance: z.literal("template"), // outcome lines are template-authored by construction
    }),
  ),
  unresolved: z.array(
    z.object({
      kind: z.enum([
        "unanswered_reply",
        "uncountered_evidence",
        "contested_amount_mismatch",
        "absent_acceptance_criteria",
        "missing_written_rejection",
      ]),
      refs: z.array(z.string()),
      provenance: z.literal("computed"),
    }),
  ),
  /**
   * Citation depth per party (FIN-126 symmetry). A count of distinct
   * evidence/check references that support each side's POSITION, computed from
   * the findings + unresolved items. The frame is generated blind to which
   * outcome the findings favour (P6): this field is what the symmetry test
   * asserts is balanced — both parties' material cited at equal depth.
   *
   * This is a STRUCTURAL count, not a score: it counts references, it never
   * weighs them. Equal depth does NOT mean equal merit; it means the frame
   * hasn't quietly enriched one side.
   */
  citationDepth: z.object({
    platform: z.number().int().min(0),
    recipient: z.number().int().min(0),
  }),
  modelDigest: modelDigestSchema.nullable(), // null when the frame degraded to templates-only
  generatedAt: z.string().datetime(),
  // FORBIDDEN — validateFrameNoVerdict() rejects verdict/score/confidence/ranking
});

/**
 * EvidenceAnnotation (FIN-130, A2 post-hackathon) — a stamped summary written
 * ON an existing EvidenceItem, never as a new fact. Schema defined now; no
 * runtime in this build. BANNED: new facts without a source hash; references
 * outside the evidence table.
 */
export const evidenceAnnotationSchema = z.object({
  schemaVersion: z.literal(1),
  annotationId: z.string(),
  evidenceId: z.string(),
  sourceSha256: sha256Schema, // the hash of the evidence it read — the stamp (P7)
  summary: z.string(),
  spansCited: z.array(z.string()), // byte/line spans within the source
  readerType: z.enum(["pdf", "thread", "link", "image", "text"]),
  modelDigest: modelDigestSchema,
}).strict(); // FIN-130: reject unknown keys — an annotation may not smuggle new facts

/**
 * ProposedCase (FIN-130, A5 post-hackathon) — a person opens the case; the
 * agent only proposes from patterns. Schema defined now; no runtime.
 * BANNED: any auto-open flag or case-status field.
 */
export const proposedCaseSchema = z.object({
  schemaVersion: z.literal(1),
  proposalId: z.string(),
  patternId: z.enum([
    "unmatched_payment",
    "repeat_clawback",
    "clustered_drawdown",
  ]),
  eventsCited: z.array(z.string()),
  receiptRefs: z.array(z.string()),
  proposalText: z.string(),
  // FORBIDDEN — no autoOpen, no status field (enforced by .strict() + validateProposedCase)
}).strict();

/**
 * LawLine (FIN-112) — an authored governing-law note. Plain-language, one
 * sentence, citation-free in the line itself (sources live in sourceRefs). A
 * settled common-law principle may carry an empty sourceRefs; an invented
 * citation is never permitted (law-lines-protocol §3). Authored offline and
 * signed off by a person (P10); a model-touched draft carries reviewRef
 * "PENDING AG SIGN-OFF" and never ships in a frozen seed.
 *
 * `note` is the human label (e.g. "law note 1"); the parent clause row carries
 * the numeric clauseNumber.
 */
export const lawLineSchema = z.object({
  note: z.string(), // human label, e.g. "law note 1"
  text: z.string(), // one plain-language sentence — no inline citation
  jurisdiction: z.string(), // e.g. "Ireland"
  author: z.string(), // who authored it (offline); never a model name
  reviewRef: z.string(), // human-review reference; "PENDING AG SIGN-OFF" until approved
  version: z.number().int().positive(),
  sourceRefs: z.array(
    z.object({
      cite: z.string(), // citation as it appears on the primary source
      url: z.string().url(), // the primary source opened during verification
    }),
  ),
}).strict();

/**
 * PolicyClause (FIN-110) — a clause from a hashed policy pack, authored offline
 * and reviewed by a person (P10). Runtime insertion is rejected at the model
 * layer. Parameters carry the clause's numeric windows (hours/days).
 *
 * A clause row with clauseNumber 0 is the governing-law note; it carries the
 * `lawLines[]` (the law library) and a `disclaimer` rendered wherever the pack
 * is cited. clauseNumber is nonnegative (0 = law line; 4/7/9 = numbered
 * clauses) — a prior `.positive()` gate silently dropped the law line (and with
 * it the whole seed) on every boot.
 */
export const policyClauseSchema = z.object({
  schemaVersion: z.literal(1),
  clauseId: z.string(),
  packRef: z.string(), // the hashed EvidenceItem this clause belongs to
  clauseNumber: z.number().int().nonnegative(), // 0 = law line; e.g. 4, 7, 9
  text: z.string(), // plain-language clause, ≤ 3 sentences
  parameters: z.object({
    hours: z.number().int().positive().optional(), // clause 4 grace window
    days: z.number().int().positive().optional(), // clause 7 acceptance period
  }),
  // The law library — present on the clauseNumber 0 (governing-law) row. Each
  // note is validated through lawLineSchema; validateNoVerdictKeys recurses
  // into this array, so a smuggled verdict key inside a note still fails.
  lawLines: z.array(lawLineSchema).optional(),
  disclaimer: z.string().optional(), // rendered wherever the pack is cited
  jurisdiction: z.string().optional(), // e.g. "Ireland"
  author: z.string(), // who authored it (offline)
  reviewRef: z.string(), // human-review reference (PR link)
  version: z.number().int().positive(),
}).strict();

export type DraftFrame = z.infer<typeof draftFrameSchema>;
export type EvidenceAnnotation = z.infer<typeof evidenceAnnotationSchema>;
export type ProposedCase = z.infer<typeof proposedCaseSchema>;
export type LawLine = z.infer<typeof lawLineSchema>;
export type PolicyClause = z.infer<typeof policyClauseSchema>;
export type ModelDigest = z.infer<typeof modelDigestSchema>;

/* -------------------------------------------------------------------------- */
/* Per-record validators (FIN-130)                                            */
/*                                                                            */
/* Every agent record is validated before persist: .strict() rejects unknown  */
/* keys, then validateNoVerdictKeys rejects verdict-shaped keys/banned language*/
/* at any depth. "Attempted verdict field on any record fails at the model    */
/* layer" — these validators are the model-layer gate.                         */
/* -------------------------------------------------------------------------- */

/**
 * Validate an EvidenceAnnotation: strict parse + verdict-key scan. A2 readers
 * (post-hackathon) may only annotate existing evidence; new facts or unstamped
 * claims are rejected here.
 */
export function validateEvidenceAnnotation(obj: unknown): EvidenceAnnotation {
  const parsed = evidenceAnnotationSchema.parse(obj);
  validateNoVerdictKeys(parsed);
  return parsed;
}

/**
 * Validate a ProposedCase: strict parse + verdict-key scan + explicit rejection
 * of auto-open/status fields. A person opens the case; the agent only proposes.
 */
export function validateProposedCase(obj: unknown): ProposedCase {
  // Scan raw input for banned proposal fields BEFORE strict parse strips them.
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const keys = Object.keys(obj as Record<string, unknown>);
    const banned = keys.find((k) =>
      ["autoopen", "auto_open", "status", "state", "caseid", "case_id"].includes(k.toLowerCase()),
    );
    if (banned) {
      throw new Error(
        `Forbidden field "${banned}" on ProposedCase. A person opens the case; the agent never auto-opens (P6, FIN-130).`,
      );
    }
  }
  const parsed = proposedCaseSchema.parse(obj);
  validateNoVerdictKeys(parsed);
  return parsed;
}

/**
 * Validate a PolicyClause: strict parse + verdict-key scan. Runtime insertion of
 * a clause is rejected — clauses are authored offline, reviewed, versioned (P10).
 */
export function validatePolicyClause(obj: unknown): PolicyClause {
  const parsed = policyClauseSchema.parse(obj);
  validateNoVerdictKeys(parsed);
  return parsed;
}
