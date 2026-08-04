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

export type ReceiptEnvelope = z.infer<typeof receiptEnvelopeSchema>;
export type ClaimEnvelope = z.infer<typeof claimEnvelopeSchema>;
export type ResponseEnvelope = z.infer<typeof responseEnvelopeSchema>;
export type DecisionEnvelope = z.infer<typeof decisionEnvelopeSchema>;
export type CorrectionInstructionEnvelope = z.infer<typeof correctionInstructionEnvelopeSchema>;
export type AgentFactPack = z.infer<typeof agentFactPackSchema>;
