/* ============================================================================
   Document attachment services (PAY-DOC).
   Thin service functions backing the upload/link/download endpoints. Each
   resolves the owning entity (case or work order), writes the enriched Evidence
   or WorkOrder document record, and triggers the agent summary pipeline.

   Visibility rule (per product decision):
     - Uploaded FILES (PDF/MD/TXT) → visibility ARBITER_ONLY (only the arbiter
       downloads; uploaders see metadata: title, filename, sha, size).
     - Inline TEXT → SHARED (unchanged legacy behaviour).
     - LINKS (YouTube) → SHARED (it's just a URL).
   ========================================================================== */

import { generateId } from "@finne/domain";
import { HttpError } from "../errors.ts";
import { Case, Evidence, WorkOrder } from "../models/index.ts";
import { isValidVideoLink } from "../integrations/storage/uploadPolicy.ts";

/**
 * @deprecated Use isValidVideoLink from uploadPolicy instead. Kept for any
 * external callers; now delegates to the central validator (any HTTPS video link).
 */
export function isYouTubeUrl(url: string): boolean {
  return isValidVideoLink(url);
}

/** Who the caller is, in the legacy evidence vocabulary (platform | recipient). */
function submittedByForRole(role: string | null): "platform" | "recipient" {
  return role === "recipient" ? "recipient" : "platform";
}

/** Persist a finalized uploaded file as case evidence (arbiter-only visibility). */
export async function attachEvidenceDocument(params: {
  caseNumber: string;
  submittedByRole: string | null;
  title: string;
  stored: { evidenceId: string; sha256: string; mimeType: string; sizeBytes: number; objectKey: string; filename: string };
}): Promise<{ evidenceId: string }> {
  const caseDoc = await Case.findOne({ caseNumber: params.caseNumber });
  if (!caseDoc) throw new HttpError(404, `No case ${params.caseNumber} found.`);
  if (caseDoc.status === "CLOSED") {
    throw new HttpError(409, "Evidence closed when the case was decided.");
  }

  const evidenceId = generateId("ev");
  await Evidence.create({
    caseRef: params.caseNumber,
    payoutRef: caseDoc.payoutRef,
    submittedBy: submittedByForRole(params.submittedByRole),
    type: "document",
    title: params.title,
    fileOrText: `file:${params.stored.filename}`,
    sha256: params.stored.sha256,
    submittedAt: new Date().toISOString(),
    kind: "doc",
    source: "upload",
    objectKey: params.stored.objectKey,
    filename: params.stored.filename,
    mimeType: params.stored.mimeType,
    sizeBytes: params.stored.sizeBytes,
    visibility: "ARBITER_ONLY",
  });

  // Trigger the agent summary pipeline (fire-and-forget, P8 never-crash).
  void import("../agent/evidenceAnnotations.ts")
    .then(({ summarizeEvidenceDocument }) =>
      summarizeEvidenceDocument({
        ownerRef: `case:${params.caseNumber}:${evidenceId}`,
        evidenceId,
        objectKey: params.stored.objectKey,
        mimeType: params.stored.mimeType,
        sourceSha256: params.stored.sha256,
        filename: params.stored.filename,
        title: params.title,
        caseNumber: params.caseNumber,
      }),
    )
    .catch((e) =>
      console.error(`[documents] summarize failed for case evidence ${evidenceId}:`, e instanceof Error ? e.message : e),
    );

  return { evidenceId };
}

/** Persist a link (e.g. YouTube) as case evidence (shared visibility). */
export async function attachEvidenceLink(params: {
  caseNumber: string;
  submittedByRole: string | null;
  title: string;
  linkUrl: string;
}): Promise<{ evidenceId: string }> {
  const caseDoc = await Case.findOne({ caseNumber: params.caseNumber });
  if (!caseDoc) throw new HttpError(404, `No case ${params.caseNumber} found.`);
  if (caseDoc.status === "CLOSED") {
    throw new HttpError(409, "Evidence closed when the case was decided.");
  }
  if (!isValidVideoLink(params.linkUrl)) {
    throw new HttpError(
      400,
      "Link must be a valid https:// URL to a video (YouTube, Loom, Vimeo, or any provider). Bare IPs and localhost are not allowed.",
    );
  }

  const evidenceId = generateId("ev");
  await Evidence.create({
    caseRef: params.caseNumber,
    payoutRef: caseDoc.payoutRef,
    submittedBy: submittedByForRole(params.submittedByRole),
    type: "link",
    title: params.title,
    fileOrText: params.linkUrl,
    sha256: "", // links are not content-hashed
    submittedAt: new Date().toISOString(),
    kind: "video",
    source: "link",
    linkUrl: params.linkUrl,
    visibility: "SHARED",
  });

  // Trigger a link annotation (the agent records a short note keyed on the URL).
  void import("../agent/evidenceAnnotations.ts")
    .then(({ summarizeEvidenceLink }) =>
      summarizeEvidenceLink({
        ownerRef: `case:${params.caseNumber}:${evidenceId}`,
        evidenceId,
        linkUrl: params.linkUrl,
        title: params.title,
        caseNumber: params.caseNumber,
      }),
    )
    .catch((e) =>
      console.error(`[documents] summarize-link failed for case evidence ${evidenceId}:`, e instanceof Error ? e.message : e),
    );

  return { evidenceId };
}

/** Attach a finalized uploaded file to a work order (payment-time contract). */
export async function attachWorkOrderDocument(params: {
  paymentId: string;
  stored: { sha256: string; mimeType: string; sizeBytes: number; objectKey: string; filename: string };
}): Promise<{ documentId: string }> {
  const workOrder = await WorkOrder.findOne({ paymentId: params.paymentId });
  if (!workOrder) {
    throw new HttpError(404, `No work order for payment ${params.paymentId}. Create the payout metadata first.`);
  }

  const documentId = generateId("doc");
  const doc = {
    documentId,
    filename: params.stored.filename,
    mimeType: params.stored.mimeType,
    sizeBytes: params.stored.sizeBytes,
    sha256: params.stored.sha256,
    objectKey: params.stored.objectKey,
    uploadedAt: new Date().toISOString(),
  };
  // The documents array is a mutable appendix (push only, never edit/remove).
  workOrder.documents = [...(workOrder.documents ?? []), doc];
  await workOrder.save();

  // Trigger the agent summary pipeline for the contract.
  void import("../agent/evidenceAnnotations.ts")
    .then(({ summarizeEvidenceDocument }) =>
      summarizeEvidenceDocument({
        ownerRef: `workorder:${params.paymentId}:${documentId}`,
        evidenceId: documentId,
        objectKey: params.stored.objectKey,
        mimeType: params.stored.mimeType,
        sourceSha256: params.stored.sha256,
        filename: params.stored.filename,
        title: params.stored.filename,
      }),
    )
    .catch((e) =>
      console.error(`[documents] summarize failed for workorder doc ${documentId}:`, e instanceof Error ? e.message : e),
    );

  return { documentId };
}

/** Resolve an evidenceId (case evidence) → its objectKey, for the download endpoint. */
export async function resolveEvidenceObjectKey(_caseNumber: string, evidenceId: string): Promise<string> {
  // The legacy Evidence model's primary key is Mongo _id. The route passes the
  // Mongo _id string, so look it up directly.
  const doc = await Evidence.findById(evidenceId).lean();
  if (!doc) throw new HttpError(404, `Evidence ${evidenceId} not found.`);
  if (!doc.objectKey) throw new HttpError(404, `Evidence ${evidenceId} has no attached file.`);
  return doc.objectKey;
}
