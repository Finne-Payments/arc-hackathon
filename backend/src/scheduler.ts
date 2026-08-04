import { Case, Meta } from "./models/index.ts";
import { applyCaseEvent } from "./stateMachines.ts";

/* ============================================================================
   Deadline scheduler (GAP-B13, PRD §10.2). The POST /internal/cases/:id/
   deadline-passed route existed, but nothing fired it on a timer — so cases
   stuck in AWAITING_RESPONSE never advanced to UNDER_REVIEW when the recipient
   let the window lapse.

   This ticks every POLL_MS, finds cases whose responseDeadline has passed while
   still AWAITING_RESPONSE, and applies the `deadline_passed` event. Idempotent:
   once advanced the transition throws (swallowed) and the case stops matching.

   Observability: writes a heartbeat to Meta (scheduler:heartbeat) on every tick
   so /status can report liveness + how many cases it advanced. isSchedulerStale()
   exposes the staleness check.
   ========================================================================== */

const POLL_MS = 60_000; // once a minute is plenty for a response-window timer
const STALE_THRESHOLD_MS = 300_000; // 5× the poll — a stalled scheduler misses 5 ticks

const HEARTBEAT_KEY = "scheduler:heartbeat";

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startDeadlineScheduler(): void {
  if (running) return;
  running = true;
  timer = setInterval(tick, POLL_MS);
  console.log("[scheduler] deadline checker running every", POLL_MS, "ms");
}

export function stopDeadlineScheduler(): void {
  running = false;
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  let advanced = 0;
  try {
    const now = new Date().toISOString();
    const overdue = await Case.find({
      status: "AWAITING_RESPONSE",
      responseDeadline: { $lte: now },
    }).limit(100);

    for (const caseDoc of overdue) {
      try {
        const after = applyCaseEvent(
          { status: caseDoc.status as never, infoRequestCount: caseDoc.infoRequestCount },
          "deadline_passed",
        );
        caseDoc.status = after.status;
        await caseDoc.save();
        advanced++;
        console.log(`[scheduler] case ${caseDoc.caseNumber}: response window lapsed → ${after.status}`);
      } catch {
        // Already advanced past AWAITING_RESPONSE (e.g. recipient replied, or a
        // second info-request reset the deadline). Expected — ignore.
      }
    }
  } catch (e) {
    console.error("[scheduler] deadline tick error:", e instanceof Error ? e.message : e);
  } finally {
    // Always ping — a tick that errors is still a live (if unhealthy) scheduler.
    await writeHeartbeat(advanced).catch(() => {});
  }
}

/** Heartbeat written every tick so /status can report liveness + throughput. */
async function writeHeartbeat(advanced: number): Promise<void> {
  await Meta.findOneAndUpdate(
    { key: HEARTBEAT_KEY },
    {
      value: { at: new Date().toISOString(), advanced },
      updatedAt: new Date().toISOString(),
    },
    { upsert: true },
  );
}

/** Whether the scheduler heartbeat is older than STALE_THRESHOLD_MS (used by /status + /health/ready). */
export async function isSchedulerStale(): Promise<boolean> {
  const meta = await Meta.findOne({ key: HEARTBEAT_KEY });
  if (!meta) return true;
  const at = (meta.value as { at?: string }).at;
  if (!at) return true;
  return Date.now() - new Date(at).getTime() > STALE_THRESHOLD_MS;
}
