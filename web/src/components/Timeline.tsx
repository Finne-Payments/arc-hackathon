import type { ReactNode } from "react";

/* ============================================================================
   Timeline — renders the case chronicle returned by GET /cases/:id/timeline.
   Each entry has a time, a type (→ color dot), a label, and an optional
   detail line (the content of the event — a reply snippet, brief headline,
   claim text, etc.). Extracted from CaseRoom so it can be reused and so the
   case room's sections stay readable.
   ========================================================================== */

const TYPE_DOT: Record<string, string> = {
  payment: "var(--brand-500)",
  dispute: "var(--warn-500)",
  reply: "var(--ok-500)",
  evidence: "var(--ink-500)",
  agent: "var(--brand-400)",
  info: "var(--brand-500)",
  decision: "var(--brand-600)",
};

export interface TimelineEntry {
  time: string;
  type: string;
  label: string;
  detail?: string;
  txHash?: string;
}

export function Timeline({
  events,
  loading,
  explorerUrl,
}: {
  events: TimelineEntry[];
  loading?: ReactNode;
  /** Block-explorer base URL (e.g. https://testnet.arcscan.app) — turns tx ↗ into a real link. */
  explorerUrl?: string | null;
}) {
  const txHref = (hash: string) =>
    explorerUrl ? `${explorerUrl.replace(/\/+$/, "")}/tx/${hash}` : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display: "flex", gap: 14, fontSize: 13, padding: "9px 0" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-fg-subtle)", width: 96, flexShrink: 0, paddingTop: 1 }}>
            {ev.time}
          </span>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_DOT[ev.type] ?? "var(--ink-400)", marginTop: 5, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{ev.label}</strong>
            {ev.txHash && txHref(ev.txHash) && (
              <a
                href={txHref(ev.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                title="View transaction on explorer"
                style={{ fontSize: 12, marginLeft: 6, color: "var(--brand-600)", textDecoration: "none" }}
              >
                tx ↗
              </a>
            )}
            {ev.detail && (
              <div style={{ fontSize: 12.5, color: "var(--color-fg-muted)", marginTop: 2, lineHeight: 1.45 }}>{ev.detail}</div>
            )}
          </span>
        </div>
      ))}
      {events.length === 0 && <div style={{ fontSize: 13, color: "var(--color-fg-subtle)" }}>{loading ?? "Loading timeline…"}</div>}
    </div>
  );
}
