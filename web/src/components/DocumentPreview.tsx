import { useEffect, useState } from "react";
import type { PreviewResult } from "../api";
import { Spinner } from "./primitives";
import { shortHex } from "../mappers";

/* ============================================================================
   DocumentPreview — an inline modal that renders a private document's content.
   Fetches renderable content from the backend preview endpoint (which enforces
   the case-party access boundary) and shows it without leaving the app:
     - text/markdown/PDF → a scrollable, readable text block (PDF is the agent's
       extracted text — readable; the original can still be downloaded for fidelity)
     - video             → a native <video controls> player bound to a presigned URL
     - link              → an "Open video ↗" action (the link itself)
   The modal is private: it's only reachable by authenticated case parties (the
   preview endpoint is gated by the evidence:download permission).
   ========================================================================== */

export function DocumentPreview({
  load,
  onClose,
}: {
  /** Fetches the preview content. The caller binds this to the right case/payment + id. */
  load: () => Promise<PreviewResult>;
  onClose: () => void;
}) {
  const [data, setData] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    load()
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load the document."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 18, 24, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-2xl)",
          boxShadow: "var(--shadow-lg, 0 12px 40px rgba(0,0,0,0.18))",
          overflow: "hidden",
        }}
      >
        {/* Header — filename + sha + close */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-surface-2)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {data?.filename ?? "Loading…"}
            </div>
            {data && (
              <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", fontFamily: "var(--font-mono)" }}>
                {data.mimeType}
                {data.sha256 ? ` · sha: ${shortHex(data.sha256)}` : ""}
              </div>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--brand-700)", background: "var(--brand-50)", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-pill)", padding: "2px 9px", whiteSpace: "nowrap" }}>
            Private · case parties only
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--color-fg-muted)", lineHeight: 1, padding: "0 4px" }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
          {error && <div style={{ fontSize: 13, color: "var(--risk-600)" }}>{error}</div>}
          {!error && !data && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-fg-muted)", fontSize: 13 }}>
              <Spinner size={16} /> Loading document…
            </div>
          )}
          {data && data.kind === "text" && (
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: data.mimeType.includes("markdown") || data.mimeType.startsWith("text/") ? "var(--font-sans)" : "var(--font-mono)",
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--color-fg)",
              }}
            >
              {data.content}
            </pre>
          )}
          {data && data.kind === "video" && (
            <video
              src={data.content}
              controls
              style={{ width: "100%", borderRadius: "var(--radius-md)", background: "#000" }}
            />
          )}
          {data && data.kind === "link" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "24px 0" }}>
              <div style={{ fontSize: 14, color: "var(--color-fg-muted)" }}>This is a video link. Open it to view:</div>
              <a
                href={data.content}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                  background: "var(--brand-600)",
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  textDecoration: "none",
                }}
              >
                Open video ↗
              </a>
              <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", wordBreak: "break-all", maxWidth: 480, textAlign: "center" }}>
                {data.content}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
