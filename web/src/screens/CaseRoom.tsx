import { useEffect, useState } from "react";
import type { FinneActions, ViewModel } from "../useFinne";
import type { ApiData } from "../useApi";
import type { PayoutRow, CaseRow, AgentFrame } from "../api";
import { api } from "../api";
import {
  BackLink,
  Card,
  Eyebrow,
  PrimaryButton,
  SecondaryButton,
  SharedViewBadge,
  SpinnerLabel,
  StatusPill,
} from "../components/primitives";
import { Timeline, type TimelineEntry } from "../components/Timeline";
import { shortHex } from "../mappers";
import { claimLabel } from "../domain/statusVocabulary";

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

export function CaseRoom({ v, actions, apiData }: { v: ViewModel; actions: FinneActions; apiData?: ApiData }) {
  const c = apiData?.activeCase ?? null;
  const caseDoc: CaseRow | null = (c?.case as CaseRow) ?? null;
  const caseNumber = caseDoc?.caseNumber ?? v.selectedCaseId ?? "";
  const payout: PayoutRow | null = (c?.payout as PayoutRow) ?? null;
  const responses = (c?.responses as { author: string; authorName: string; text: string; submittedAt: string }[]) ?? [];
  const evidence = (c?.evidence as { title: string; submittedBy: string; submittedAt: string; sha256: string; type: string }[]) ?? [];
  const brief = c?.brief?.latest as { checks: { check: string; expected: string; found: string; result: string }[]; inconsistencies: string[]; missingItems: string[] } | undefined;
  // The v1 agent frame (turning questions + findings + unresolved). Null until the
  // agents run. frameStatus is non-null while they're running.
  const frame = c?.frame ?? null;
  const frameStatus = c?.frameStatus ?? null;
  const [refreshing, setRefreshing] = useState(false);

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  useEffect(() => {
    if (!caseNumber) return;
    setTimelineLoading(true);
    api
      .timeline(caseNumber)
      .then((t) => setTimeline(t.events))
      .catch(() => {})
      .finally(() => setTimelineLoading(false));
  }, [caseNumber]);

  const claimText = caseDoc?.allegationFreeText ?? "—";
  const contested = caseDoc?.allegationAmountContested ?? "0";
  const caseCode = caseDoc?.caseCode || caseNumber;
  const claimLabelText = claimLabel(caseDoc?.allegationClaimType);
  const hasBrief = !!brief;

  // Response composer state — shown when there are unanswered info requests
  // directed at the current user's side (merchant=platform, customer=recipient).
  // Only show requests since the LAST response from this user — not all
  // historical unanswered ones (those were already addressed).
  const [responseText, setResponseText] = useState("");
  const [responseSending, setResponseSending] = useState(false);
  const myTarget = v.isClaimant ? "platform" : v.isRecipient ? "recipient" : null;
  // Find the timestamp of the most recent response — requests after that are new.
  const lastResponseTime = responses.length > 0
    ? responses[responses.length - 1].submittedAt
    : null;
  const myOpenRequests = (caseDoc?.infoRequests ?? []).filter(
    (r) => r.target === myTarget
      && !r.answeredAt
      && (!lastResponseTime || new Date(r.requestedAt).getTime() > new Date(lastResponseTime).getTime()),
  );

  const submitResponse = async () => {
    const t = responseText.trim();
    if (!t || !caseNumber) return;
    setResponseSending(true);
    try {
      await api.respond(caseNumber, { text: t });
      setResponseText("");
      // Reload the case so the response appears in the conversation.
      actions.viewCase(caseNumber);
    } catch {
      // keep the text so the user can retry
    } finally {
      setResponseSending(false);
    }
  };

  // Message composer — always available for any party on an open case.
  // This is a free-form chat message that joins the shared conversation,
  // giving transparency and ongoing communication beyond formal info requests.
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const canMessage = (v.isClaimant || v.isRecipient || v.isReviewer) && caseDoc?.status !== "CLOSED" && caseDoc?.status !== "EXECUTED";

  const sendMessage = async () => {
    const t = messageText.trim();
    if (!t || !caseNumber) return;
    setMessageSending(true);
    try {
      await api.respond(caseNumber, { text: t });
      setMessageText("");
      actions.viewCase(caseNumber);
    } catch {
      // keep the text so the user can retry
    } finally {
      setMessageSending(false);
    }
  };

  // While the case data is loading (or the case number is missing), show a
  // loading state instead of rendering with empty placeholders.
  if (!caseDoc && caseNumber) {
    return (
      <div className="rise-in" style={{ maxWidth: 820, margin: 0 }}>
        <BackLink label="All disputes" onClick={() => actions.go("disputes")} />
        <div style={{ marginTop: 40, display: "flex", justifyContent: "center" }}>
          <SpinnerLabel label={`Loading ${caseNumber}…`} />
        </div>
      </div>
    );
  }
  if (!caseDoc) {
    return (
      <div className="rise-in" style={{ maxWidth: 820, margin: 0 }}>
        <BackLink label="All disputes" onClick={() => actions.go("disputes")} />
        <div style={{ marginTop: 40, fontSize: 14, color: "var(--color-fg-muted)" }}>
          No case selected. Pick one from the disputes list.
        </div>
      </div>
    );
  }

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
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em" }}>{caseCode}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-fg-subtle)" }}>{caseNumber}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginTop: 2 }}>
              Concerns <a onClick={() => caseDoc.payoutRef && actions.viewReceipt(caseDoc.payoutRef)} style={{ cursor: "pointer", fontWeight: 600 }}>the {payout?.amount ?? ""} USDC payment</a>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 19, fontVariantNumeric: "tabular-nums" }}>{contested} USDC</div>
            <div style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>contested</div>
          </div>
          <div style={{ width: 1, height: 36, background: "var(--color-border)" }} />
          <div style={{ textAlign: "right" }}>
            <StatusPill label={v.caseChipLabel} dot={v.caseChipColor.includes("risk") ? "risk" : v.caseChipColor.includes("brand") ? "brand" : "warn"} />
          </div>
        </div>
      </Card>

      {/* (a) the claim */}
      <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 12 }}>The claim</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--color-fg-muted)", marginBottom: 12, flexWrap: "wrap" }}>
          Opened by <strong style={{ color: "var(--color-fg)" }}>{caseDoc?.openedBy === "recipient" ? "Recipient" : "Platform"}</strong>
          <span style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-pill)", padding: "2px 10px", fontSize: 12, fontWeight: 500, color: "var(--color-fg)" }}>{claimLabelText}</span>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.65 }}>
          “{claimText}”
        </p>
        <div style={{ fontSize: 13, color: "var(--color-fg-muted)" }}>
          <span style={{ fontWeight: 600, color: "var(--color-fg)" }}>Asking for:</span> {contested} USDC returned to the refund address fixed at payment time.
        </div>
      </Card>

      {/* (b) the conversation — info requests + responses, chronological */}
      {(caseDoc?.infoRequests?.length > 0 || responses.length > 0) && (
        <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
          <Eyebrow style={{ marginBottom: 14 }}>Conversation</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Merge info requests and responses into one timeline, sorted by time */}
            {[
              ...(caseDoc?.infoRequests ?? []).map((r) => ({
                kind: "request" as const,
                time: r.requestedAt,
                author: `Arbiter → ${r.target === "recipient" ? "Customer" : "Merchant"}`,
                text: r.text,
                role: "arbiter",
              })),
              ...responses.map((r) => ({
                kind: "response" as const,
                time: r.submittedAt,
                author: r.authorName ?? (r.author === "recipient" ? "Customer" : "Merchant"),
                text: r.text,
                role: r.author,
              })),
            ]
              .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
              .map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 12,
                    flexDirection: msg.role === "arbiter" ? "row" : "row-reverse",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "80%",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      background: msg.role === "arbiter" ? "var(--brand-50)" : "var(--color-surface-2)",
                      border: `1px solid ${msg.role === "arbiter" ? "var(--brand-200)" : "var(--color-border)"}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: msg.role === "arbiter" ? "var(--brand-800)" : "var(--color-fg)" }}>{msg.author}</span>
                      <span style={{ fontSize: 11, color: "var(--color-fg-subtle)" }}>{new Date(msg.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-fg)" }}>{msg.text}</div>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Response composer — shown when there are unanswered info requests
          directed at the current user (merchant or customer). */}
      {myOpenRequests.length > 0 && (v.isClaimant || v.isRecipient) && (
        <div style={{ background: "var(--warn-soft)", border: "1.5px solid var(--warn-border)", borderRadius: "var(--radius-lg)", padding: "20px 22px", marginBottom: 16 }}>
          <Eyebrow color="var(--warn-600)" style={{ marginBottom: 8 }}>
            The arbiter needs a response from you
          </Eyebrow>
          {/* Show ALL unanswered requests directed at this user */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {myOpenRequests.map((req, i) => (
              <div key={i} style={{ fontSize: 14, lineHeight: 1.6, padding: "8px 12px", background: "var(--color-surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                <span style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginRight: 6 }}>{new Date(req.requestedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                {req.text}
              </div>
            ))}
          </div>
          <textarea
            className="finne-textarea"
            placeholder="Write your response…"
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            style={{ marginBottom: 10, minHeight: 80 }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PrimaryButton onClick={submitResponse} disabled={responseSending || !responseText.trim()} style={{ fontSize: 13, padding: "9px 16px" }}>
              {responseSending ? "Sending…" : "Send your response"}
            </PrimaryButton>
            <SecondaryButton onClick={v.openEv} style={{ fontSize: 13, padding: "9px 16px" }}>
              Attach evidence
            </SecondaryButton>
            <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>Your response and evidence join the shared record.</span>
          </div>
        </div>
      )}

      {/* Message composer — always-available chat for any party on an open case */}
      {canMessage && myOpenRequests.length === 0 && (
        <Card shadow="var(--shadow-xs)" padding="20px 22px" style={{ marginBottom: 16, border: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Eyebrow style={{ margin: 0 }}>Send a message</Eyebrow>
            <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>
              Visible to all parties — use this to share updates, ask questions, or provide context.
            </span>
          </div>
          <textarea
            className="finne-textarea"
            placeholder="Type a message to the arbiter and other party…"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            style={{ minHeight: 64 }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PrimaryButton onClick={sendMessage} disabled={messageSending || !messageText.trim()} style={{ fontSize: 13, padding: "9px 16px" }}>
              {messageSending ? "Sending…" : "Send message"}
            </PrimaryButton>
            <SecondaryButton onClick={v.openEv} style={{ fontSize: 13, padding: "9px 16px" }}>
              Attach evidence
            </SecondaryButton>
          </div>
        </Card>
      )}

      {/* (c) the evidence */}
      <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 12 }}>The evidence</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {evidence.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--color-fg-subtle)", padding: "4px 0" }}>No evidence submitted yet.</div>
          )}
          {evidence.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "14px 16px", fontSize: 13, background: e.submittedBy === "agent" ? "var(--brand-50)" : "var(--color-surface)" }}>
              <div style={{ flexShrink: 0, marginTop: 1 }}>
                <FileIcon kind={(e.type === "deliverable" || e.type === "message") ? "video" : "doc"} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{e.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--color-fg-subtle)" }}>
                  <span style={{ border: `1px solid ${e.submittedBy === "agent" ? "var(--brand-200)" : "var(--color-border)"}`, borderRadius: "var(--radius-pill)", padding: "1px 8px", color: e.submittedBy === "agent" ? "var(--brand-800)" : "var(--color-fg-muted)" }}>
                    {e.submittedBy === "platform" ? "Merchant" : e.submittedBy === "recipient" ? "Customer" : e.submittedBy}
                  </span>
                  <span>{new Date(e.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>sha: {shortHex(e.sha256)}</span>
                </div>
              </div>
            </div>
          ))}

          {/* newly added evidence items */}
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

      {/* (c) the agent's brief — the verdict-free decision frame (turning questions,
          findings, unresolved items). Auto-runs when the dispute opens; a Refresh
          button re-reads on-chain + off-chain data and re-runs the agents. Falls
          back to the legacy brief table if only that exists, or an empty state. */}
      <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Eyebrow style={{ marginBottom: 0 }}>The agent's brief</Eyebrow>
          <button
            onClick={() => { setRefreshing(true); api.refreshCase(caseNumber).then(() => actions.reloadCase()).finally(() => setRefreshing(false)); }}
            disabled={refreshing}
            style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", color: "var(--color-fg)", cursor: refreshing ? "default" : "pointer", opacity: refreshing ? 0.6 : 1 }}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>

        {frame ? (
          <AgentBriefFrame frame={frame} />
        ) : frameStatus?.running ? (
          <AgentBriefRunning stages={frameStatus.stages} />
        ) : hasBrief ? (
          <>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.3fr .8fr", gap: 12, padding: "9px 14px", background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)" }}>
                <span>Check</span>
                <span>Expected</span>
                <span>Found</span>
                <span>Result</span>
              </div>
              {brief!.checks.map((c, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.3fr .8fr", gap: 12, padding: "11px 14px", borderBottom: i < brief!.checks.length - 1 ? "1px solid var(--color-border)" : "none", fontSize: 13, alignItems: "center" }}>
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
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-fg)" }}>{(brief!.inconsistencies.length ? brief!.inconsistencies : ["None identified."]).join(" · ")}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 6 }}>Missing items</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-fg)" }}>{(brief!.missingItems.length ? brief!.missingItems : ["None."]).join(" · ")}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
              Prepared by the Finné proof agent. It reads and explains; it does not decide.
            </div>
          </>
        ) : (
          <div style={{ padding: "8px 2px 4px", color: "var(--color-fg-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
            The agents are preparing this case. They run automatically when a dispute opens and again whenever evidence is added — their findings (what’s on file, what’s missing) will appear here. If nothing appears shortly, press Refresh. It never renders a verdict.
          </div>
        )}
      </Card>

      {/* (d) timeline */}
      <Card shadow="var(--shadow-xs)" padding="22px 24px" style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 14 }}>Timeline</Eyebrow>
        <Timeline
          events={timeline}
          loading={timelineLoading ? <SpinnerLabel label="Loading timeline…" /> : undefined}
          explorerUrl={apiData?.config?.explorerUrl ?? null}
        />
      </Card>

      {/* case actions */}

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
                  Merchant · Northstar
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

/* ============================================================================
   Agent brief renderers — the verdict-free decision frame shown in the legacy
   case room. `AgentBriefFrame` renders the persisted frame (turning questions,
   unresolved items); `AgentBriefRunning` shows per-stage progress while the
   Bedrock calls are in flight.
   ========================================================================== */

const STAGE_LABEL: Record<string, string> = {
  proof_checks: "Proof checks",
  turning_questions: "Turning questions",
  narrative: "Narrative summary",
  assemble: "Assemble frame",
};

function AgentBriefFrame({ frame }: { frame: AgentFrame }) {
  return (
    <>
      {frame.questions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 6 }}>Questions the case turns on</div>
          {frame.questions.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0", fontSize: 13, color: "var(--color-fg)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--brand-600)", flexShrink: 0 }}>→</span>
              <span style={{ flex: 1 }}>{q.text}</span>
              {q.provenance === "model" && (
                <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--color-fg-subtle)", background: "var(--color-surface-2)", padding: "1px 5px", borderRadius: "var(--radius-xs)", flexShrink: 0 }}>model</span>
              )}
            </div>
          ))}
        </div>
      )}
      {frame.unresolved.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 6 }}>Unresolved</div>
          {frame.unresolved.map((u, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13, color: "var(--color-fg-muted)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warn-500)", flexShrink: 0 }} />
              {u.kind.replace(/_/g, " ")}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--color-fg-subtle)", borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
        Prepared by the Finné agent from on-chain + off-chain facts. It prepares and points; it does not decide.
        {frame.degradeLevel > 0 && <span style={{ color: "var(--warn-600)" }}> ⚠ simplified (model offline).</span>}
      </div>
    </>
  );
}

function AgentBriefRunning({ stages }: { stages: { name: string; status: string }[] }) {
  return (
    <div style={{ padding: "8px 2px 4px" }}>
      <SpinnerLabel label="Agents are preparing this case…" />
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {stages.map((s) => {
          const done = s.status === "done";
          const degraded = s.status === "degraded";
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--color-fg-muted)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: done ? "var(--ok-500)" : degraded ? "var(--warn-500)" : "var(--brand-500)" }} />
              <span style={{ flex: 1 }}>{STAGE_LABEL[s.name] ?? s.name}</span>
              {done ? (
                <span style={{ fontSize: 10, color: "var(--ok-600)" }}>done</span>
              ) : degraded ? (
                <span style={{ fontSize: 10, color: "var(--warn-600)" }}>degraded</span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--brand-600)" }}>running…</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
