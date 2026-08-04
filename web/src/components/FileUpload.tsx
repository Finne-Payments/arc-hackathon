import { useRef, useState } from "react";
import { SecondaryButton } from "./primitives";

/* ============================================================================
   FileUpload — a reusable upload control for documents (PDF/MD/TXT) and links.
   Implements the three-step presigned-upload flow the backend exposes:
     1. allocate  → backend returns a presigned PUT URL
     2. PUT       → the browser uploads the raw bytes straight to S3 / local store
     3. complete  → backend verifies the object, records metadata, triggers the
                    agent summary

   The component is scope-agnostic: it works for both case evidence (scope "case")
   and payment-time contracts (scope "workorder"). It calls the right pair of
   allocate/complete callbacks the parent provides.

   Styling matches the existing inline-style + finne-input convention (no CSS
   framework in this codebase).
   ========================================================================== */

// Documents the agents can read + video files the arbiter can view.
const ACCEPTED = ".pdf,.md,.markdown,.txt,.text,.json,.csv,.yaml,.yml,.mp4,.mov,.webm,.avi";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (matches the backend cap)

type UploadMode = "file" | "link";

export interface UploadedDoc {
  /** The evidenceId (case) or documentId (work order). */
  evidenceId?: string;
  documentId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export function FileUpload({
  mode,
  allocate,
  complete,
  onLink,
  onUploaded,
  label = "Attach document",
  hint,
}: {
  /** Start in file or link mode. */
  mode?: UploadMode;
  /** Allocate a presigned PUT URL. Returns the uploadId + URL. */
  allocate: (filename: string, mimeType: string, sizeBytes: number) => Promise<{
    uploadId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }>;
  /** Finalize: verify + record. Passes the original filename back. Returns whatever the API gives back. */
  complete: (uploadId: string, filename: string) => Promise<UploadedDoc>;
  /** Add a link (e.g. YouTube). Only used in link mode. */
  onLink?: (title: string, url: string) => Promise<{ evidenceId: string }>;
  /** Called when a document finishes uploading (parent refreshes state). */
  onUploaded?: (doc: UploadedDoc) => void;
  label?: string;
  hint?: string;
}) {
  const [activeMode, setActiveMode] = useState<UploadMode>(mode ?? "file");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB.`);
      return;
    }
    setBusy(true);
    try {
      // 1. allocate
      const allocation = await allocate(file.name, file.type || guessMime(file.name), file.size);
      // 2. PUT the raw bytes to the presigned URL.
      const putRes = await fetch(allocation.uploadUrl, {
        method: "PUT",
        headers: allocation.headers,
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status}). The file store may be unreachable.`);
      }
      // 3. complete — verify + record metadata + trigger the agent summary.
      const doc = await complete(allocation.uploadId, file.name);
      onUploaded?.(doc);
      // Reset the input so the same file can be re-selected if needed.
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLink() {
    setError(null);
    if (!linkTitle.trim() || !linkUrl.trim()) {
      setError("Both a title and the link URL are required.");
      return;
    }
    if (!onLink) {
      setError("Links are not supported here.");
      return;
    }
    setBusy(true);
    try {
      await onLink(linkTitle.trim(), linkUrl.trim());
      setLinkTitle("");
      setLinkUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Mode switch */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <ModeTab active={activeMode === "file"} onClick={() => setActiveMode("file")} disabled={busy}>
          📄 File
        </ModeTab>
        {onLink && (
          <ModeTab active={activeMode === "link"} onClick={() => setActiveMode("link")} disabled={busy}>
            ▶ Link
          </ModeTab>
        )}
      </div>

      {activeMode === "file" ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            style={{ display: "none" }}
          />
          <SecondaryButton
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            style={{ fontSize: 13, padding: "8px 14px" }}
          >
            {busy ? "Uploading…" : label}
          </SecondaryButton>
          {hint && (
            <span style={{ marginLeft: 10, fontSize: 12, color: "var(--color-fg-subtle)" }}>{hint}</span>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            className="finne-input"
            placeholder="Title (e.g. Delivery walkthrough)"
            value={linkTitle}
            disabled={busy}
            onChange={(e) => setLinkTitle(e.target.value)}
            style={{ fontSize: 13 }}
          />
          <input
            className="finne-input"
            placeholder="https:// (YouTube, Loom, Vimeo, or any video link)"
            value={linkUrl}
            disabled={busy}
            onChange={(e) => setLinkUrl(e.target.value)}
            style={{ fontSize: 13 }}
          />
          <div>
            <SecondaryButton
              onClick={handleLink}
              disabled={busy}
              style={{ fontSize: 13, padding: "8px 14px" }}
            >
              {busy ? "Adding…" : "Add link"}
            </SecondaryButton>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "var(--risk-600)", marginTop: 2 }}>{error}</div>
      )}
    </div>
  );
}

function ModeTab({
  children,
  active,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: active ? "1.5px solid var(--brand-200)" : "1px solid var(--color-border)",
        background: active ? "var(--brand-50)" : "var(--color-surface)",
        color: active ? "var(--brand-800)" : "var(--color-fg-muted)",
        borderRadius: "var(--radius-md)",
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Best-effort MIME guess from extension when the browser doesn't set one. */
function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    text: "text/plain",
    json: "application/json",
    csv: "text/csv",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
  };
  return map[ext] ?? "application/octet-stream";
}
