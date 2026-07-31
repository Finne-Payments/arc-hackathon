import { useEffect, useState } from "react";
import type { FinneActions, ViewModel } from "../useFinne";
import type { ApiData } from "../useApi";
import type { PayoutRow, CaseRow } from "../api";
import { api } from "../api";
import {
  BackLink,
  Card,
  Eyebrow,
  PrimaryButton,
  SecondaryButton,
  SharedViewBadge,
  StatusPill,
} from "../components/primitives";
import { shortHex } from "../mappers";

const TYPE_DOT: Record<string, string> = {
  payment: "var(--brand-500)",
  dispute: "var(--warn-500)",
  reply: "var(--ok-500)",
  agent: "var(--ink-400)",
  info: "var(--brand-500)",
  decision: "var(--brand-600)",
};

function FileIcon({ kind }: { kind: "doc" | "video" }) {
  if (kind === "video") {
    return (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--ink-500)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="m22 8-6 4 6 4V8Z" />
        <rect x="2" y="6" width="14" height="12" rx="2" />
      </svg>
    );
  }
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--ink-500)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

interface TimelineEntry {
  time: string;
  type: string;
  label: string;
  txHash?: string;
}

export function CaseRoom({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  const c = apiData?.activeCase ?? null;
  const caseDoc: CaseRow | null = (c?.case as CaseRow) ?? null;
  const caseNumber = caseDoc?.caseNumber ?? "CASE-0142";
  const payout: PayoutRow | null = (c?.payout as PayoutRow) ?? null;
  const responses = (c?.responses as { authorName: string; text: string; submittedAt: string }[]) ?? [];
  const evidence = (c?.evidence as { title: string; submittedBy: string; submittedAt: string; sha256: string; type: string }[]) ?? [];
  const brief = c?.brief?.latest as { checks: { check: string; expected: string; found: string; result: string }[]; inconsistencies: string[]; missingItems: string[] } | undefined;

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  useEffect(() => {
    if (!caseNumber || caseNumber === "CASE-0142" && !caseDoc) return;
    api.timeline(caseNumber).then((t) => setTimeline(t.events)).catch(() => {});
  }, [caseNumber, caseDoc]);

  const claimText = caseDoc?.allegationFreeText ?? "—";
  const contested = caseDoc?.allegationAmountContested ?? "0";
  const response = responses[0];

  return (
    <div className="rise-in" style={{ maxWidth: 820, margin: 0 }}>
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <BackLink label="All disputes" onClick={() => actions.go("disputes")} />
        <span style={{ flex: 1 }} />
        <SharedViewBadge />
      </div>

      {/* header */}
      <Card shadow="var(--shadow-xs)" padding="20px 24px" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em" }}>Case 0142</div>
            <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginTop: 2 }}>
              Concerns <a onClick={() => actions.go("receipt")} style={{ cursor: "pointer", fontWeight: 600 }}>the {payout?.amount ?? ""} USDC payment</a>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 19, fontVariantNumeric: "tabular-nums" }}>{contested} USDC</div>
            <div style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>contested</div>
          </div>
          <div style={{ width: 1, height: 36, background: "var(--color-border)" }} />
          <div style={{ textAlign: "right" }}>
            {v.stageAwaiting ? (
              <>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 19, fontVariantNumeric: "tabular-nums", color: "var(--warn-600)" }}>{v.countdown}</div>
                <div style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>to reply</div>
              </>
            ) : (
              <StatusPill label={v.caseChipLabel} dot={v.caseChipColor.includes("risk") ? "risk" : v.caseChipColor.includes("brand") ? "brand" : "warn"} />
            )}
          </div>
        </div>
      </Card>

      {/* (a) the claim */}
      <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 12 }}>The claim</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 12, flexWrap: "wrap" }}>
          Opened by <strong style={{ color: "var(--color-fg)" }}>{caseDoc?.openedBy === "recipient" ? "Recipient" : "Platform"}</strong>
          <span style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-pill)", padding: "2px 10px", fontSize: 12, fontWeight: 500, color: "var(--color-fg)" }}>{caseDoc?.allegationClaimType ?? "Dispute"}</span>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.65 }}>
          “{claimText}”
        </p>
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>
          <span style={{ fontWeight: 600, color: "var(--color-fg)" }}>Asking for:</span> {contested} USDC returned to the refund address fixed at payment time.
        </div>
      </Card>

      {/* directed information request (target side) */}
      {v.showReqCard && (
        <div style={{ background: "var(--warn-soft)", border: "1.5px solid var(--warn-border)", borderRadius: "var(--radius-lg)", padding: "20px 22px", marginBottom: 16 }}>
          <Eyebrow color="var(--warn-600)" style={{ marginBottom: 8 }}>
            The arbiter needs something from you
          </Eyebrow>
          <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>“{v.reqCardText}”</div>
          <textarea className="finne-textarea" placeholder="Write your answer…" style={{ marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <SecondaryButton style={{ fontSize: 13, padding: "8px 14px" }}>Attach document</SecondaryButton>
            <PrimaryButton style={{ fontSize: 13, padding: "9px 16px" }}>Send to the case</PrimaryButton>
            <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>Your answer joins the shared evidence record.</span>
          </div>
        </div>
      )}

      {/* reply composer (recipient, awaiting) */}
      {v.showComposer && (
        <div style={{ background: "var(--brand-50)", border: "1.5px solid var(--brand-200)", borderRadius: "var(--radius-lg)", padding: "22px 24px", marginBottom: 16 }}>
          <Eyebrow color="var(--brand-700)" style={{ marginBottom: 6 }}>
            Your reply
          </Eyebrow>
          <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 12 }}>
            This is your right of reply — your statement and anything you attach appear alongside the claim, with equal weight, before anyone decides. Due in {v.countdown}.
          </div>
          <textarea className="finne-textarea" placeholder="Tell your side plainly. What happened with Video 3?" style={{ minHeight: 96 }} />
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <SecondaryButton style={{ fontSize: 13, padding: "8px 14px" }}>Attach evidence</SecondaryButton>
            <span style={{ flex: 1 }} />
            <PrimaryButton style={{ fontSize: 13, padding: "9px 16px" }}>Submit reply</PrimaryButton>
          </div>
        </div>
      )}

      {/* (b2) the response */}
      {v.showReply && (
        <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
          <Eyebrow style={{ marginBottom: 12 }}>The response</Eyebrow>
          <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 12 }}>
            From <strong style={{ color: "var(--color-fg)" }}>{response?.authorName ?? "Recipient"}</strong>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>
            “{response?.text ?? "No response yet."}”
          </p>
        </Card>
      )}

      {/* (b) the evidence */}
      <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 12 }}>The evidence</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {evidence.map((e, i) => (
            <div key={i} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 13 }}>
              <FileIcon kind={(e.type === "deliverable" || e.type === "message") ? "video" : "doc"} />
              <span style={{ flex: 1, fontWeight: 500 }}>{e.title}</span>
              <span
                style={{
                  border: e.submittedBy === "agent" ? "1px solid var(--brand-200)" : "1px solid var(--color-border)",
                  background: e.submittedBy === "agent" ? "var(--brand-50)" : "transparent",
                  borderRadius: "var(--radius-pill)",
                  padding: "1px 8px",
                  fontSize: 11,
                  color: e.submittedBy === "agent" ? "var(--brand-800)" : "var(--color-fg-muted)",
                }}
              >
                {e.submittedBy}
              </span>
              <span style={{ color: "var(--color-fg-subtle)", fontSize: 12 }}>{new Date(e.submittedAt).toLocaleDateString()}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-fg-subtle)" }}>{shortHex(e.sha256)}</span>
              <a style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{e.submittedBy === "agent" ? "↗" : "Open"}</a>
            </div>
          ))}

          {/* newly added evidence items */}
          {v.evItems.map((ev, i) => (
            <div key={`ev-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, border: "1px solid var(--brand-200)", background: "var(--brand-50)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 13, marginTop: 8 }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span style={{ flex: 1, lineHeight: 1.55 }}>{ev.text}</span>
              <span style={{ border: "1px solid var(--brand-200)", background: "var(--color-surface)", borderRadius: "var(--radius-pill)", padding: "1px 8px", fontSize: 11, color: "var(--brand-800)", flexShrink: 0 }}>{ev.side} · you</span>
              <span style={{ color: "var(--color-fg-subtle)", fontSize: 12, flexShrink: 0 }}>just now</span>
            </div>
          ))}

          {/* add evidence composer */}
          {v.showAddEvidence && (
            <>
              {v.evPrompt && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, border: "1.5px dashed var(--color-border-strong)", borderRadius: "var(--radius-md)", padding: "12px 14px", flexWrap: "wrap" }}>
                  <SecondaryButton onClick={v.openEv} style={{ fontSize: 13, padding: "8px 14px" }}>Add evidence</SecondaryButton>
                  <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>
                    Anything you add as {v.evidenceAsLabel} is visible to both sides, dated and fingerprinted. Evidence closes when the case is decided.
                  </span>
                </div>
              )}
              {v.evComposerOpen && (
                <div style={{ marginTop: 12, border: "1.5px solid var(--brand-200)", borderRadius: "var(--radius-md)", padding: "14px 16px", background: "var(--color-surface)" }}>
                  <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", marginBottom: 8 }}>
                    Adding as {v.evidenceAsLabel} · visible to both sides, dated and fingerprinted.
                  </div>
                  <textarea
                    className="finne-textarea"
                    value={v.evText}
                    onChange={(e) => v.onEvText(e.target.value)}
                    placeholder="Add a message or describe what you're attaching…"
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <SecondaryButton style={{ fontSize: 13, padding: "8px 14px" }}>Attach file</SecondaryButton>
                    <span style={{ flex: 1 }} />
                    <SecondaryButton onClick={v.cancelEv} style={{ fontSize: 13, padding: "8px 14px" }}>Cancel</SecondaryButton>
                    <button
                      onClick={v.addEv}
                      disabled={v.evSendDisabled}
                      style={{
                        border: "none",
                        cursor: v.evSendCursor,
                        background: v.evSendBg,
                        color: v.evSendFg,
                        fontFamily: "var(--font-sans)",
                        fontWeight: 600,
                        fontSize: 13,
                        padding: "9px 16px",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      Add to case
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* (c) the agent's brief */}
      <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 12 }}>The agent's brief</Eyebrow>
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.3fr .8fr", gap: 12, padding: "9px 14px", background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)" }}>
            <span>Check</span>
            <span>Expected</span>
            <span>Found</span>
            <span>Result</span>
          </div>
          {(brief?.checks ?? []).map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.3fr .8fr", gap: 12, padding: "11px 14px", borderBottom: i < (brief?.checks.length ?? 1) - 1 ? "1px solid var(--color-border)" : "none", fontSize: 13, alignItems: "center" }}>
              <span>{c.check}</span>
              <span style={{ color: "var(--color-fg-muted)" }}>{c.expected}</span>
              <span style={{ color: "var(--color-fg-muted)" }}>{c.found}</span>
              <span style={{ color: c.result === "pass" ? "var(--ok-600)" : "var(--warn-600)", fontWeight: 600 }}>{c.result === "pass" ? "✓ Pass" : "○ Missing"}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 6 }}>Inconsistencies</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-fg)" }}>{(brief?.inconsistencies ?? ["None identified."]).join(" · ")}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 6 }}>Missing items</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-fg)" }}>{(brief?.missingItems ?? ["None."]).join(" · ")}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
          Prepared by the Finné proof agent. It reads and explains; it does not decide.
        </div>
      </Card>

      {/* (d) timeline */}
      <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 14 }}>Timeline</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {timeline.map((ev, i) => (
            <div key={i} style={{ display: "flex", gap: 14, fontSize: 13, padding: "8px 0" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-fg-subtle)", width: 96, flexShrink: 0 }}>{ev.time}</span>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_DOT[ev.type] ?? "var(--ink-400)", marginTop: 4, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                <strong>{ev.label}</strong>
                {ev.txHash && <a style={{ cursor: "pointer", fontSize: 12, marginLeft: 6 }}>tx ↗</a>}
              </span>
            </div>
          ))}
          {timeline.length === 0 && <div style={{ fontSize: 13, color: "var(--color-fg-subtle)" }}>Loading timeline…</div>}
        </div>
      </Card>

      {/* case actions */}
      {v.isReviewer && v.stageAwaiting && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "14px 18px", flexWrap: "wrap" }}>
          <button disabled style={{ border: "none", background: "var(--ink-100)", color: "var(--color-fg-subtle)", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 14, padding: "10px 18px", borderRadius: "var(--radius-md)", cursor: "not-allowed" }}>
            Decide this case
          </button>
          <span style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>Decision opens when the reply arrives or the window closes.</span>
        </div>
      )}

      {v.canDecide && (
        <>
          {v.reqSent && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--brand-50)", border: "1px solid var(--brand-200)", borderRadius: "var(--radius-md)", padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "var(--brand-800)" }}>
              <span style={{ fontWeight: 600 }}>{v.reqSentLabel}</span> Each request is on the shared timeline; the named side's reply window has reopened. You can request more at any time before deciding.
            </div>
          )}

          {v.showReqComposer && (
            <Card shadow="var(--shadow-xs)" style={{ border: "1.5px solid var(--brand-200)", padding: "20px 22px", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Request more information</div>
              <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", marginBottom: 12 }}>
                Say exactly what you need. Only the side you name is asked to respond — this is a directed request, not a group chat. The request itself stays on the shared record.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg-muted)" }}>From</span>
                <button onClick={v.reqToMerchant} style={{ cursor: "pointer", border: `1.5px solid ${v.reqMerBorder}`, background: v.reqMerBg, borderRadius: "var(--radius-pill)", padding: "3px 12px", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                  Merchant · Northbeam
                </button>
                <button onClick={v.reqToCustomer} style={{ cursor: "pointer", border: `1.5px solid ${v.reqCusBorder}`, background: v.reqCusBg, borderRadius: "var(--radius-pill)", padding: "3px 12px", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                  Customer · Maya
                </button>
              </div>
              <textarea className="finne-textarea" value={v.reqText} onChange={(e) => v.onReqText(e.target.value)} placeholder="e.g. Attach the original transfer-link email for Video 3, including the send date." style={{ minHeight: 72 }} />
              <div style={{ display: "flex", gap: 10, marginTop: 10, justifyContent: "flex-end" }}>
                <SecondaryButton onClick={v.toggleReq} style={{ fontSize: 13, padding: "8px 14px" }}>Cancel</SecondaryButton>
                <button onClick={v.sendReq} disabled={v.reqSendDisabled} style={{ border: "none", cursor: v.reqSendCursor, background: v.reqSendBg, color: v.reqSendFg, fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13, padding: "8px 16px", borderRadius: "var(--radius-md)" }}>
                  Send request
                </button>
              </div>
            </Card>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            {v.reqNotSent && (
              <SecondaryButton onClick={v.toggleReq} style={{ fontSize: 14, padding: "10px 16px" }}>
                {v.reqBtnLabel}
              </SecondaryButton>
            )}
            <PrimaryButton onClick={() => actions.go("decision")} style={{ fontSize: 14, padding: "10px 20px" }}>
              Decide this case
            </PrimaryButton>
          </div>
        </>
      )}

      {v.stageDecided && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "14px 18px", flexWrap: "wrap" }}>
          <StatusPill label="Refunded" dot="risk" />
          <span style={{ fontSize: 13, color: "var(--color-fg-muted)", flex: 1 }}>This case is closed. The record is locked; corrections are added, never edited.</span>
          <SecondaryButton onClick={() => actions.go("final")} style={{ fontSize: 13, padding: "8px 15px" }}>
            View final receipt
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}
