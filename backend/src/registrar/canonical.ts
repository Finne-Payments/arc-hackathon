/* ============================================================================
   Canonical envelope verification (BE-03).
   Receipt, claim, response, analysis, decision, and correction-instruction
   envelopes: canonicalized, hashed, and verifiable. Old envelopes remain
   verifiable after upgrades (schema-versioned).
   ========================================================================== */

import { canonicalHash, sha256Hex } from "../canonical.ts";
import type {
  ReceiptEnvelope,
  ClaimEnvelope,
  ResponseEnvelope,
  DecisionEnvelope,
  CorrectionInstructionEnvelope,
} from "@finne/domain";

/* -------------------------------------------------------------------------- */
/* Envelope builders — assemble, canonicalize, hash. The hash goes on chain.  */
/* -------------------------------------------------------------------------- */

/** Build + hash a receipt envelope. The receiptHash is what registerReceipt anchors. */
export function buildReceiptEnvelope(input: Omit<ReceiptEnvelope, "receiptHash">): ReceiptEnvelope & { receiptHash: string } {
  const envelope = { ...input, schemaVersion: 1 as const };
  const receiptHash = canonicalHash(envelope);
  return { ...envelope, receiptHash };
}

/** Build + hash a claim envelope. The claimHash is what openCase anchors. */
export function buildClaimEnvelope(input: Omit<ClaimEnvelope, "claimHash">): ClaimEnvelope & { claimHash: string } {
  const envelope = { ...input, schemaVersion: 1 as const };
  const claimHash = canonicalHash(envelope);
  return { ...envelope, claimHash };
}

/** Build + hash a response envelope. */
export function buildResponseEnvelope(input: Omit<ResponseEnvelope, "responseHash">): ResponseEnvelope & { responseHash: string } {
  const envelope = { ...input, schemaVersion: 1 as const };
  const responseHash = canonicalHash(envelope);
  return { ...envelope, responseHash };
}

/** Build + hash a decision envelope. The decisionHash is what recordDecision anchors. */
export function buildDecisionEnvelope(input: Omit<DecisionEnvelope, "decisionHash">): DecisionEnvelope & { decisionHash: string } {
  const envelope = { ...input, schemaVersion: 1 as const };
  const decisionHash = canonicalHash(envelope);
  return { ...envelope, decisionHash };
}

/** Build + hash a correction instruction envelope. */
export function buildCorrectionInstructionEnvelope(
  input: Omit<CorrectionInstructionEnvelope, "instructionHash">,
): CorrectionInstructionEnvelope & { instructionHash: string } {
  const envelope = { ...input, schemaVersion: 1 as const };
  const instructionHash = canonicalHash(envelope);
  return { ...envelope, instructionHash };
}

/* -------------------------------------------------------------------------- */
/* Verification — recompute the hash and compare. Old envelopes stay verif.   */
/* -------------------------------------------------------------------------- */

export function verifyReceiptHash(envelope: ReceiptEnvelope): boolean {
  const rest = { ...envelope };
  delete (rest as Record<string, unknown>).receiptHash;
  return canonicalHash(rest) === envelope.receiptHash;
}

export function verifyClaimHash(envelope: ClaimEnvelope): boolean {
  const rest = { ...envelope };
  delete (rest as Record<string, unknown>).claimHash;
  return canonicalHash(rest) === envelope.claimHash;
}

export function verifyDecisionHash(envelope: DecisionEnvelope): boolean {
  const rest = { ...envelope };
  delete (rest as Record<string, unknown>).decisionHash;
  return canonicalHash(rest) === envelope.decisionHash;
}

/** Evidence sha256 fingerprint (wraps the existing canonical.ts helper). */
export function evidenceFingerprint(content: string | Uint8Array): string {
  return sha256Hex(content);
}
