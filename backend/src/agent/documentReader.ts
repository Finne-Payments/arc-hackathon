/* ============================================================================
   Document reader (FIN-130 runtime — the "no runtime in this build" seam).
   Fetches the raw bytes of a stored document and extracts plain text the agent
   model can reason over. Never throws (P8 never-crash): a failure returns
   { text: null } and the caller degrades to "no summary".

   Reader strategies by MIME type:
     - text/markdown, text/plain, application/json → raw UTF-8 (capped)
     - application/pdf → unpdf extractText() (ESM-clean; no CJS pdf-parse)
     - anything else → null (the agent notes an opaque file is on file)

   YouTube/links are NOT read here — the link URL is passed directly to the model
   in summarizeEvidenceLink (per product decision: store link, agent sees URL only).
   ========================================================================== */

import { getEvidenceStore } from "../integrations/storage/localStore.ts";
import { isVideoMime } from "../integrations/storage/uploadPolicy.ts";

/** Cap extracted text so a single document can't blow the model context window. */
const MAX_TEXT_CHARS = 12_000;

export interface ReadDocumentResult {
  text: string | null;
  readerType: "pdf" | "text" | "video";
  bytes: number;
}

/** Read a stored document's bytes and extract plain text. Never throws. */
export async function readDocumentText(
  objectKey: string,
  mimeType: string,
): Promise<ReadDocumentResult> {
  try {
    const store = getEvidenceStore();

    // Uploaded video files are classified but NOT transcribed (per product
    // decision: no speech-to-text in this build). The arbiter views the video;
    // the agent records a clear "video on file" note.
    if (isVideoMime(mimeType)) {
      const bytes = await store.getObjectBytes(objectKey);
      return { text: null, readerType: "video", bytes: bytes?.length ?? 0 };
    }

    const bytes = await store.getObjectBytes(objectKey);
    if (!bytes || bytes.length === 0) {
      return { text: null, readerType: mimeIsPdf(mimeType) ? "pdf" : "text", bytes: 0 };
    }

    const isText = mimeIsText(mimeType);
    if (isText) {
      const text = decodeText(bytes).slice(0, MAX_TEXT_CHARS);
      return { text: text.trim() || null, readerType: "text", bytes: bytes.length };
    }

    if (mimeIsPdf(mimeType)) {
      const text = await extractPdfText(bytes);
      return { text: text ? text.slice(0, MAX_TEXT_CHARS) : null, readerType: "pdf", bytes: bytes.length };
    }

    // Opaque binary (e.g. image, docx) — no text extraction in this build.
    return { text: null, readerType: "text", bytes: bytes.length };
  } catch (e) {
    console.warn(
      `[documentReader] failed to read ${objectKey}:`,
      e instanceof Error ? e.message : e,
    );
    return { text: null, readerType: mimeIsPdf(mimeType) ? "pdf" : "text", bytes: 0 };
  }
}

function mimeIsText(mime: string): boolean {
  const m = mime.toLowerCase();
  return (
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/x-yaml" ||
    m === "application/x-sh"
  );
}

function mimeIsPdf(mime: string): boolean {
  return mime.toLowerCase() === "application/pdf";
}

/** Decode UTF-8 from a Uint8Array without requiring TextDecoder edge cases. */
function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Extract text from a PDF using unpdf (lazy import — keeps it out of non-PDF paths). */
async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text?.trim() || null;
  } catch (e) {
    console.warn("[documentReader] PDF extraction failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
