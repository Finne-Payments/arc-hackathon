/* ============================================================================
   Upload policy — the single source of truth for what a user may upload (PAY-DOC).
   Every allocate/finalize hop validates against THIS module so the rules can never
   drift between the evidence and work-order routes. The storage adapters (local +
   S3) also call into here on finalize to catch a bait-and-switch (a client that
   declares one size/mime on allocate but PUTs something larger/different).

   Two concerns, kept separate on purpose:
     - ALLOWED_MIME / ALLOWED_EXTENSION: what content we accept.
     - sanitizeFilename: defang user-supplied names before they become object keys
       or DB rows (no path traversal, no NUL, no control chars, length-bounded).

   Link policy: any HTTPS URL is accepted as a link (the product supports YouTube,
   Loom, Vimeo, Finné-hosted, or any provider). We reject non-http(s), localhost,
   and obviously-internal IPs so a link can't be a SSRF vector if a server-side
   fetch is ever wired in later (it isn't today — links are stored, not fetched).
   ========================================================================== */

/** Hard ceiling on a single upload (docs and videos). 25 MB keeps memory bounded
 *  for sha256 hashing + PDF/video-classification reads. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Documents the agents can read (extract text from). */
export const DOCUMENT_MIMES = new Set<string>([
  "application/pdf",
  "text/markdown",
  "text/plain",
  "text/csv",
  "application/json",
  "application/x-yaml",
  "application/x-sh",
]);

/** Video files a user may upload directly (no transcription — stored for the
 *  arbiter to view; the agent records a "video on file" note). */
export const VIDEO_MIMES = new Set<string>([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
]);

/** Union of accepted MIME types. */
export const ALLOWED_MIMES = new Set<string>([...DOCUMENT_MIMES, ...VIDEO_MIMES]);

/** Accepted file extensions (fallback when the browser sets no MIME type). */
export const ALLOWED_EXTENSIONS = new Set<string>([
  // documents
  "pdf", "md", "markdown", "txt", "text", "csv", "json", "yaml", "yml", "sh",
  // videos
  "mp4", "mov", "webm", "avi",
]);

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIMES.has((mime ?? "").trim().toLowerCase());
}

export function isVideoMime(mime: string): boolean {
  return VIDEO_MIMES.has((mime ?? "").trim().toLowerCase());
}

export function isDocumentMime(mime: string): boolean {
  return DOCUMENT_MIMES.has((mime ?? "").trim().toLowerCase());
}

/** Guess a MIME type from the filename extension (best-effort, lowercased). */
export function guessMimeFromFilename(filename: string): string {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    text: "text/plain",
    csv: "text/csv",
    json: "application/json",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    sh: "application/x-sh",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Whether a filename's extension is in the allow-list. */
export function hasAllowedExtension(filename: string): boolean {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  return ext.length > 0 && ALLOWED_EXTENSIONS.has(ext);
}

export interface ValidationFailure {
  ok: false;
  reason: string;
}
export interface ValidationSuccess {
  ok: true;
}
export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validate an allocate request: filename, (mime OR extension), and size against
 * the policy. Returns a human-readable reason on failure.
 */
export function validateUploadDeclaration(params: {
  filename: string;
  mimeType: string;
  declaredSizeBytes: number;
}): ValidationResult {
  const { filename, mimeType, declaredSizeBytes } = params;

  if (!filename || typeof filename !== "string" || filename.trim().length === 0) {
    return { ok: false, reason: "A filename is required." };
  }
  if (declaredSizeBytes == null || !Number.isFinite(declaredSizeBytes) || declaredSizeBytes <= 0) {
    return { ok: false, reason: "declaredSizeBytes must be a positive number." };
  }
  if (declaredSizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `Files must be 25 MB or smaller (declared ${(declaredSizeBytes / 1024 / 1024).toFixed(1)} MB).` };
  }

  const mimeOk = isAllowedMime(mimeType);
  const extOk = hasAllowedExtension(filename);
  if (!mimeOk && !extOk) {
    return {
      ok: false,
      reason: `Unsupported file type. Allowed: PDF, Markdown, text, JSON, CSV, or a video (mp4, mov, webm). Got "${mimeType || filename}".`,
    };
  }
  return { ok: true };
}

/**
 * Sanitize a user-supplied filename before it becomes part of an object key or a
 * stored record. Strips path components (no traversal), control chars, and NUL;
 * collapses runs of whitespace; bounds the length. Never returns empty.
 */
export function sanitizeFilename(filename: string): string {
  // 1. Take only the basename — drop any directory components.
  const base = (filename ?? "").split(/[/\\]/).pop() ?? "";
  // 2. Remove control characters (incl. NUL) and the POSIX path separators again.
  let clean = base.replace(/[\x00-\x1f\x7f]/g, "").replace(/[\\]/g, "");
  // 3. Collapse whitespace runs to a single space, trim.
  clean = clean.replace(/\s+/g, " ").trim();
  // 4. Bound the length (keep the extension if present).
  if (clean.length > 120) {
    const ext = clean.includes(".") ? clean.split(".").pop()! : "";
    const keep = ext ? Math.max(1, 120 - ext.length - 1) : 120;
    clean = ext ? `${clean.slice(0, keep).trim()}.${ext}` : clean.slice(0, 120).trim();
  }
  // 5. Never allow empty / dot-only names.
  if (!clean || clean === "." || clean === "..") clean = "document";
  return clean;
}

/* -------------------------------------------------------------------------- */
/* Link validation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Validate a submitted link. We accept any HTTPS URL from a video host (YouTube,
 * Loom, Vimeo, a Finné-hosted URL, or any provider) — the arbiter reviews the
 * video at the link; no server-side fetch of the link happens today.
 *
 * Security: reject non-http(s) schemes, bare IPs, and localhost/link-local so a
 * link can never be used as an SSRF vector if a server-side fetch is added later.
 */
export function isValidVideoLink(raw: string): boolean {
  const url = tryParseUrl(raw);
  if (!url) return false;
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (!host) return false;
  // Block localhost / loopback / link-local / metadata endpoints.
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.startsWith("169.254.") || // link-local
    host === "metadata.google.internal"
  ) {
    return false;
  }
  // Block a bare IP (require a DNS hostname) — defends against internal-network
  // pointers. IPv4 in dotted-quad or IPv6 in brackets.
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("[")) return false;
  return true;
}

/** Friendly host label for display (e.g. "YouTube", "Loom"), or the hostname. */
export function linkProviderLabel(raw: string): string {
  const url = tryParseUrl(raw);
  if (!url) return "link";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host.includes("youtube") || host === "youtu.be") return "YouTube";
  if (host.includes("loom")) return "Loom";
  if (host.includes("vimeo")) return "Vimeo";
  if (host.includes("finne")) return "Finné";
  return host;
}

function tryParseUrl(raw: string): URL | null {
  try {
    // URL requires a base for relative inputs; reject those by parsing absolute.
    return new URL(String(raw ?? "").trim());
  } catch {
    return null;
  }
}
