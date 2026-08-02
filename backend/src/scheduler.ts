import { Case } from "./models/index.ts";
import { applyCaseEvent } from "./stateMachines.ts";

/* ============================================================================
   Deadline scheduler (GAP-B13, PRD §10.2). The POST /internal/cases/:id/
   deadline-passed route existed, but nothing fired it on a timer — so cases
   stuck in AWAITING_RESPONSE never advanced to UNDER_REVIEW when the recipient
   let the window lapse.

   This ticks every POLL_MS, finds cases whose responseDeadline has passed while
   still AWAITING_RESPONSE, and applies the `deadline_passed` event. Idempotent:
   once advanced the transition throws (swallowed) and the case stops matching.
   ========================================================================== */

const POLL_MS = 60_000; // once a minute is plenty for a response-window timer

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
        console.log(`[scheduler] case ${caseDoc.caseNumber}: response window lapsed → ${after.status}`);
      } catch {
        // Already advanced past AWAITING_RESPONSE (e.g. recipient replied, or a
        // second info-request reset the deadline). Expected — ignore.
      }
    }
  } catch (e) {
    console.error("[scheduler] deadline tick error:", e instanceof Error ? e.message : e);
  }
}
