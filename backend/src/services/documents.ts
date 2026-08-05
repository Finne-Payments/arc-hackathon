/* ============================================================================
   Document attachment services (PAY-DOC).
   Thin service functions backing the upload/link/download/preview endpoints.
   Each resolves the owning entity (case or work order), writes the enriched
   Evidence or WorkOrder document record, and triggers the agent summary pipeline.

   Privacy model (per product decision): documents are CASE-PRIVATE — any
   authenticated party to the case (arbiter, merchant, customer) can preview and
   download. The access boundary is the `evidence:download` permission, granted
   to case parties (reviewer + recipient). `platform_viewer`/`agent_service`
   are not case parties and are excluded. The `visibility` field is retained for
   labelling (which the UI shows) but access control is the permission check.
     - Uploaded FILES (PDF/MD/TXT/video) → visibility ARBITER_ONLY (historical
       label; now previewable by all case parties).
     - Inline TEXT → SHARED.
     - LINKS (any HTTPS video) → SHARED.
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

/* -------------------------------------------------------------------------- */
/* Preview — return renderable content for the inline preview modal.           */
/*   text/markdown/PDF → extracted text (the agent's reader, capped).          */
/*   video             → a short-lived presigned GET URL (frontend <video>).   */
/*   link              → the stored URL (frontend open-link action).           */
/* Access is gated by the evidence:download permission (case parties only).    */
/* -------------------------------------------------------------------------- */

export type PreviewKind = "text" | "video" | "link";

export interface PreviewResult {
  kind: PreviewKind;
  content: string;
  mimeType: string;
  filename: string;
  sha256: string;
}

/** Preview a case evidence item. */
export async function previewEvidence(_caseNumber: string, evidenceId: string): Promise<PreviewResult> {
  const doc = await Evidence.findById(evidenceId).lean();
  if (!doc) throw new HttpError(404, `Evidence ${evidenceId} not found.`);

  // Link evidence → return the URL (the frontend shows an open-link action).
  if (doc.source === "link" && doc.linkUrl) {
    return { kind: "link", content: doc.linkUrl, mimeType: doc.mimeType ?? "text/url", filename: doc.filename ?? doc.title, sha256: doc.sha256 ?? "" };
  }
  if (!doc.objectKey) throw new HttpError(404, `Evidence ${evidenceId} has no attached file.`);

  // Video → issue a short-lived presigned GET URL for an inline <video> player.
  if (doc.mimeType && doc.mimeType.startsWith("video/")) {
    const { getEvidenceStore } = await import("../integrations/storage/localStore.ts");
    const store = await getEvidenceStore();
    const url = await store.getDownloadUrl(doc.objectKey);
    return { kind: "video", content: url.url, mimeType: doc.mimeType, filename: doc.filename ?? doc.title, sha256: doc.sha256 ?? "" };
  }

  // Text/markdown/PDF → extract readable text via the agent's document reader.
  const { readDocumentText } = await import("../agent/documentReader.ts");
  const { text } = await readDocumentText(doc.objectKey, doc.mimeType ?? "application/octet-stream");
  return {
    kind: "text",
    content: text ?? `No extractable text for "${doc.filename ?? doc.title}". Download the original to view it.`,
    mimeType: doc.mimeType ?? "application/octet-stream",
    filename: doc.filename ?? doc.title,
    sha256: doc.sha256 ?? "",
  };
}

/** Preview a work-order contract document. */
export async function previewWorkOrderDocument(paymentId: string, documentId: string): Promise<PreviewResult> {
  const wo = await WorkOrder.findOne({ paymentId }).lean();
  if (!wo) throw new HttpError(404, `No work order for payment ${paymentId}.`);
  const d = (wo.documents ?? []).find((x) => x.documentId === documentId);
  if (!d) throw new HttpError(404, `Document ${documentId} not found.`);

  if (d.mimeType.startsWith("video/")) {
    const { getEvidenceStore } = await import("../integrations/storage/localStore.ts");
    const store = await getEvidenceStore();
    const url = await store.getDownloadUrl(d.objectKey);
    return { kind: "video", content: url.url, mimeType: d.mimeType, filename: d.filename, sha256: d.sha256 };
  }

  const { readDocumentText } = await import("../agent/documentReader.ts");
  const { text } = await readDocumentText(d.objectKey, d.mimeType);
  return {
    kind: "text",
    content: text ?? `No extractable text for "${d.filename}". Download the original to view it.`,
    mimeType: d.mimeType,
    filename: d.filename,
    sha256: d.sha256,
  };
}
