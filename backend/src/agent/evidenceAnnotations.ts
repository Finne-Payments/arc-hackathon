/* ============================================================================
   Evidence annotations (FIN-130 runtime).
   On document upload (case evidence OR work-order contract) or link add, the
   agent reads the document text and writes a sha-stamped summary (P7: the
   summary is keyed to the source's sha256, never a free-floating fact). The
   summary surfaces as a card under the evidence item in the arbiter's CaseRoom
   AND is fed into the agent frame context (so the frame reflects document content).

   Mirrors the existing fire-and-forget pattern of recordEvidence → frame assembly
   (services.ts:574). Never throws; failures write a `degraded` annotation so the
   arbiter sees the document is on file even when the model was offline.
   ========================================================================== */

import { generateId } from "@finne/domain";
import { EvidenceAnnotation } from "../models/index.ts";
import { readDocumentText } from "./documentReader.ts";
import { complete, modelDigest, type CompletionResult } from "./model-client.ts";
import { linkProviderLabel } from "../integrations/storage/uploadPolicy.ts";

interface SummarizeParams {
  ownerRef: string; // "case:<caseNumber>:<evidenceId>" | "workorder:<paymentId>:<documentId>"
  evidenceId: string;
  objectKey: string;
  mimeType: string;
  sourceSha256: string;
  filename: string;
  title: string;
  caseNumber?: string; // when set, re-run the frame pipeline after summarizing
}

const SUMMARIZE_SYSTEM = `You are a meticulous clerk assisting a dispute arbiter. You are given the extracted text of a single document submitted as evidence or a contract. Summarize it for the arbiter in 2-4 sentences: what the document is, its key terms or claims, and any detail material to a payment dispute (dates, amounts, obligations, deliverables, acceptance criteria). State only what the document says — do not speculate, do not opine on who is right, do not invent facts not present. If the text is empty or unreadable, say "Document content could not be extracted."`;

/** Summarize an uploaded file (PDF/MD/TXT). Reads the bytes, extracts text, calls the model. */
export async function summarizeEvidenceDocument(params: SummarizeParams): Promise<void> {
  const { text, readerType, bytes } = await readDocumentText(params.objectKey, params.mimeType);

  let result: CompletionResult;
  if (readerType === "video") {
    // Uploaded video file: no transcript in this build. Record a clear note so
    // the arbiter knows a video is on file and should view it. We still call the
    // model so the annotation carries a real digest; the note is useful degraded.
    const prompt = [
      `Evidence item: ${params.title}`,
      `Uploaded video file: ${params.filename} (${params.mimeType}, ${bytes} bytes)`,
      "",
      "Note for the arbiter: this is a video file submitted as evidence. Transcripts are not extracted in this build — the arbiter should download and review the video.",
    ].join("\n");
    result = await complete({ task: "evidence.summary.video", system: SUMMARIZE_SYSTEM, prompt, maxTokens: 300 });
  } else if (text && text.trim().length > 0) {
    const prompt = [
      `Document: ${params.title} (${params.filename}, ${params.mimeType}, ${bytes} bytes)`,
      `SHA256: ${params.sourceSha256}`,
      "",
      "Begin document text:",
      text,
    ].join("\n");
    result = await complete({
      task: "evidence.summary",
      system: SUMMARIZE_SYSTEM,
      prompt,
      maxTokens: 600,
    });
  } else {
    // No extractable text — record a degraded note (the file is still on file).
    result = {
      text: `Document "${params.filename}" is on file (${params.mimeType}, ${bytes} bytes). Text could not be extracted for summary; the arbiter should download the original.`,
      degraded: true,
      reason: "disabled",
      callId: generateId("modelcall"),
    };
  }

  const summary = result.text ?? `Document "${params.filename}" is on file but could not be summarized (model unavailable).`;
  await writeAnnotation({
    ownerRef: params.ownerRef,
    evidenceId: params.evidenceId,
    sourceSha256: params.sourceSha256,
    summary,
    readerType,
    degraded: result.degraded,
  });

  // Re-run the frame so the case reflects the new document summary. Use the
  // by-number path so this works for BOTH legacy and v1 cases (legacy cases
  // exist only in the legacy Case collection, which assembleForCaseByNumber reads).
  if (params.caseNumber) {
    void import("../v1/frameOrchestrator.ts")
      .then(({ assembleForCaseByNumber }) => assembleForCaseByNumber(params.caseNumber!))
      .catch((e) => console.error(`[annotations] frame re-run failed for ${params.caseNumber}:`, e instanceof Error ? e.message : e));
  }
}

interface SummarizeLinkParams {
  ownerRef: string;
  evidenceId: string;
  linkUrl: string;
  title: string;
  caseNumber: string;
}

/** For a video link (YouTube, Loom, Vimeo, etc.), the agent records a short note
 *  keyed on the URL — no transcript fetch (per product decision). */
export async function summarizeEvidenceLink(params: SummarizeLinkParams): Promise<void> {
  const provider = linkProviderLabel(params.linkUrl);
  const prompt = [
    `Evidence item: ${params.title}`,
    `Video link (${provider}): ${params.linkUrl}`,
    "",
    `Note for the arbiter: this is a ${provider} video link submitted as evidence. The title and URL are shown above. (Transcript is not fetched in this build — the arbiter reviews the video at the link.)`,
  ].join("\n");

  // We still call the model so the annotation has a real digest; but the note is
  // deterministic enough to be useful even when degraded.
  const result = await complete({
    task: "evidence.summary.link",
    system: SUMMARIZE_SYSTEM,
    prompt,
    maxTokens: 300,
  });

  const summary =
    result.text ??
    `${linkProviderLabel(params.linkUrl)} video link "${params.title}" submitted as evidence. URL: ${params.linkUrl}. The arbiter should review the video.`;

  await writeAnnotation({
    ownerRef: params.ownerRef,
    evidenceId: params.evidenceId,
    sourceSha256: "", // links are not content-hashed
    summary,
    readerType: "link",
    degraded: result.degraded,
  });

  void import("../v1/frameOrchestrator.ts")
    .then(({ assembleForCaseByNumber }) => assembleForCaseByNumber(params.caseNumber))
    .catch((e) => console.error(`[annotations] frame re-run failed for ${params.caseNumber}:`, e instanceof Error ? e.message : e));
}

/** Persist the annotation row (idempotent: replaces any prior annotation for the same ownerRef). */
async function writeAnnotation(params: {
  ownerRef: string;
  evidenceId: string;
  sourceSha256: string;
  summary: string;
  readerType: "pdf" | "text" | "link" | "video";
  degraded: boolean;
}): Promise<void> {
  try {
    const digest = JSON.stringify(modelDigest());
    // One annotation per ownerRef (the latest summary wins). Delete-then-create
    // keeps it simple; the collection is append-only at the field level but a
    // new row for a re-summarized doc is the intended append semantic (P7).
    await EvidenceAnnotation.deleteMany({ ownerRef: params.ownerRef });
    await EvidenceAnnotation.create({
      annotationId: generateId("ann"),
      evidenceId: params.evidenceId,
      ownerRef: params.ownerRef,
      sourceSha256: params.sourceSha256,
      summary: params.summary,
      readerType: params.readerType,
      modelDigest: digest,
      degraded: params.degraded,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn(`[annotations] failed to persist annotation for ${params.ownerRef}:`, e instanceof Error ? e.message : e);
  }
}
