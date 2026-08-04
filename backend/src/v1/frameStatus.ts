/* ============================================================================
   Frame-run status — a lightweight, in-memory record of which agent pipeline
   stage is running for a case. Hackathon scope: frame assembly takes seconds
   (the Bedrock calls), not minutes, so a persistent Job row is overkill. This
   map is the channel through which getCaseDetail tells the UI "agents are
   running" without the UI needing to poll a separate endpoint.

   Lifecycle: markRunning(caseId) at start → markStage(caseId, name, status) as
   each stage completes → clear(caseId) when assembly finishes. If the process
   restarts mid-run, the entry simply vanishes (the UI then shows the "Prepare
   frame" affordance — recoverable, no corruption).
   ========================================================================== */

export type FrameStageName =
  | "proof_checks" // deterministic checks (runChecks) — instant
  | "turning_questions" // Bedrock: phraseTurningQuestions
  | "narrative" // Bedrock: generateNarrative
  | "assemble"; // validate + persist the DraftFrame

export type FrameStageStatus = "running" | "done" | "degraded";

export interface FrameStage {
  name: FrameStageName;
  status: FrameStageStatus;
}

export interface FrameStatus {
  running: boolean;
  startedAt: string;
  stages: FrameStage[];
  /** Set when the run completes (success or error). Null while running. */
  finishedAt: string | null;
  /** Human-readable error if the whole run failed; null otherwise. */
  error: string | null;
}

const ALL_STAGES: FrameStageName[] = ["proof_checks", "turning_questions", "narrative", "assemble"];

// Module-level map. Survives across requests within a process; cleared on restart.
const _statusByCase = new Map<string, FrameStatus>();

/** Begin a run: mark every stage pending and the first one running. */
export function markRunning(caseId: string, startWith: FrameStageName = "proof_checks"): void {
  _statusByCase.set(caseId, {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    stages: ALL_STAGES.map((name) => ({ name, status: name === startWith ? "running" : "running" })),
  });
}

/** Mark a stage's outcome and flip the next pending stage to running. */
export function markStage(caseId: string, name: FrameStageName, status: FrameStageStatus): void {
  const cur = _statusByCase.get(caseId);
  if (!cur) return;
  cur.stages = cur.stages.map((s) => (s.name === name ? { ...s, status } : s));
}

/** Finish a run (success). */
export function markDone(caseId: string): void {
  const cur = _statusByCase.get(caseId);
  if (!cur) return;
  cur.running = false;
  cur.finishedAt = new Date().toISOString();
  cur.error = null;
  // keep the final stage statuses for the UI to render one last time, then drop
  // after a short window so a later getCaseDetail returns null (frame is the
  // source of truth once persisted).
  setTimeout(() => _statusByCase.delete(caseId), 5000);
}

/** Finish a run (failure). Keeps the entry briefly so the UI can show the error. */
export function markFailed(caseId: string, error: string): void {
  const cur = _statusByCase.get(caseId);
  if (!cur) return;
  cur.running = false;
  cur.finishedAt = new Date().toISOString();
  cur.error = error;
  setTimeout(() => _statusByCase.delete(caseId), 15000);
}

/** Read the current status for a case, or null if no run is active/recent. */
export function getFrameStatus(caseId: string): FrameStatus | null {
  return _statusByCase.get(caseId) ?? null;
}
