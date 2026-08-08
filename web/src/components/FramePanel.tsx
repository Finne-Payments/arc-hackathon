/* ============================================================================
   FramePanel (FIN-125, PRD Addendum A4) — the verdict-free decision frame.

   Ported from v1's FramePanel for the legacy escrow App. Renders beside the
   reason box on the Decision screen. Three parts:
     1. Turning questions (model-phrased, marked with a provenance caption)
     2. Outcome requirements (template-authored — safe to name outcomes)
     3. Unresolved items (computed gaps)

   Per line: accept-into-reason / edit / discard. Accepted text lands editable in
   the parent reason box. The frame directs attention; it never scores, ranks, or
   marks an outcome correct (P6). Model lines are visibly marked (FIN-133).
   ========================================================================== */

import { useState } from "react";
import type { AgentFrame } from "../api";
import { Card, SecondaryButton } from "./primitives";

const EYEBROW: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".06em",
  textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 8,
};

const OUTCOME_LABEL: Record<string, string> = {
  RECIPIENT_UPHELD: "Recipient upheld",
  PLATFORM_UPHELD: "Platform upheld",
  PARTIAL_PLATFORM_UPHELD: "Partial platform upheld",
  DISMISSED_INSUFFICIENT_EVIDENCE: "Dismissed — insufficient evidence",
};

const UNRESOLVED_LABEL: Record<string, string> = {
  unanswered_reply: "Unanswered reply",
  uncountered_evidence: "Uncountered evidence",
  contested_amount_mismatch: "Contested amount doesn't match a tranche",
  absent_acceptance_criteria: "Absent acceptance criteria",
  missing_written_rejection: "Missing written rejection (clause 4)",
};

interface FramePanelProps {
  frame: AgentFrame | null;
  /** Called when the reviewer accepts a line into the reason box. */
  onAcceptLine: (text: string) => void;
  /** Called when the reviewer edits a line (logs original alongside edited, FIN-127). */
  onEditLine: (originalText: string, editedText: string) => void;
}

export function FramePanel({ frame, onAcceptLine, onEditLine }: FramePanelProps) {
  // No frame yet → the agent hasn't prepared one (it auto-runs on dispute open /
  // refresh). Show a neutral note rather than the v1 "generate" affordance, since
  // the legacy Decision screen doesn't host a prepare-frame button.
  if (!frame) {
    return (
      <Card shadow="var(--shadow-xs)" style={{ padding: 18 }}>
        <div style={EYEBROW}>Decision frame (agent)</div>
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.5 }}>
          No agent frame for this case yet. Refreshing the case room re-runs the agents — their turning questions and unresolved items appear here for you to accept into your reasons. The agent directs attention; it never decides.
        </div>
      </Card>
    );
  }

  return (
    <Card shadow="var(--shadow-xs)" style={{ padding: 18 }}>
      <div style={{ ...EYEBROW, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Decision frame (agent)</span>
        {frame.degradeLevel > 0 && (
          <span style={{ color: "var(--warn-600)", textTransform: "none", letterSpacing: 0, fontSize: 10 }}>
            ⚠ simplified (model offline)
          </span>
        )}
      </div>

      {/* Turning questions — model-phrased, each marked with provenance */}
      {frame.questions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Questions the case turns on</div>
          {frame.questions.map((q, i) => (
            <FrameLine
              key={`q-${i}`}
              text={q.text}
              provenance={q.provenance}
              refs={q.findingRefs}
              onAccept={onAcceptLine}
              onEdit={onEditLine}
            />
          ))}
        </div>
      )}

      {/* Outcome requirements — template-authored, safe to name outcomes */}
      {frame.requirements.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>What each outcome requires</div>
          {frame.requirements.map((r, i) => (
            <div key={`r-${i}`} style={{ padding: "8px 10px", marginBottom: 6, background: "var(--color-surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-700)", marginBottom: 3 }}>
                {OUTCOME_LABEL[r.outcome] ?? r.outcome}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-fg-muted)", lineHeight: 1.45 }}>
                {r.filledParams.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unresolved items — computed gaps */}
      {frame.unresolved.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Unresolved</div>
          {frame.unresolved.map((u, i) => (
            <div key={`u-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 12, color: "var(--color-fg-muted)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warn-500)", flexShrink: 0 }} />
              {UNRESOLVED_LABEL[u.kind] ?? u.kind}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 10, color: "var(--color-fg-subtle)", lineHeight: 1.4, fontStyle: "italic" }}>
        The agent prepares and points. It never decides. Lines marked “model” are phrased by the local model; the rest are computed or template-authored.
      </div>
    </Card>
  );
}

/** A single frame line with accept/edit/discard actions (FIN-125, FIN-127). */
function FrameLine({ text, provenance, refs, onAccept, onEdit }: {
  text: string;
  provenance: "template" | "computed" | "model";
  refs: string[];
  onAccept: (text: string) => void;
  /** onEdit returns the edited text so the parent can log it alongside the original (FIN-127). */
  onEdit: (originalText: string, editedText: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  if (dismissed) return null;

  const commitEdit = () => {
    const edited = draft.trim();
    if (!edited || edited === text) { setEditing(false); return; }
    onEdit(text, edited); // log original alongside edited
    onAccept(edited); // land the edited version in the reason box
    setEditing(false);
  };

  return (
    <div style={{ padding: "8px 10px", marginBottom: 6, background: "var(--color-surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        {editing ? (
          <textarea
            className="finne-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: "100%", minHeight: 48, fontSize: 12, flex: 1 }}
            autoFocus
          />
        ) : (
          <div style={{ fontSize: 12, color: "var(--color-fg)", lineHeight: 1.45, flex: 1 }}>{text}</div>
        )}
        {provenance === "model" && (
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--color-fg-subtle)", background: "var(--ink-50)", padding: "1px 5px", borderRadius: "var(--radius-xs)", flexShrink: 0 }}>model</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {editing ? (
          <>
            <SecondaryButton onClick={commitEdit} style={{ fontSize: 10, padding: "3px 8px" }}>Save edit</SecondaryButton>
            <SecondaryButton onClick={() => { setEditing(false); setDraft(text); }} style={{ fontSize: 10, padding: "3px 8px" }}>Cancel</SecondaryButton>
          </>
        ) : (
          <>
            <SecondaryButton onClick={() => onAccept(text)} style={{ fontSize: 10, padding: "3px 8px" }}>↑ Reason</SecondaryButton>
            <SecondaryButton onClick={() => setEditing(true)} style={{ fontSize: 10, padding: "3px 8px" }}>Edit</SecondaryButton>
            <SecondaryButton onClick={() => setDismissed(true)} style={{ fontSize: 10, padding: "3px 8px" }}>Discard</SecondaryButton>
          </>
        )}
      </div>
      {refs.length > 0 && (
        <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--color-fg-subtle)", marginTop: 4 }}>
          {refs.join(" · ")}
        </div>
      )}
    </div>
  );
}
