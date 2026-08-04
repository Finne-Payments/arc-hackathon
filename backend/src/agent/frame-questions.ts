/* ============================================================================
   FIN-123 — turning-question phrasing (the ONLY model call in the frame).

   The model phrases questions from failed/contested checks with clause
   citations. It POSES questions; it never answers them (P6). Each question
   carries findingRefs so the reviewer can trace it to the check that raised it.

   Flow: findings → select failed/contested → model phrases → post-filter →
   attach findingRefs. On timeout/filter-block the frame degrades to rung 2
   (no questions) — never blocks the decision (P8).
   ========================================================================== */

import type { CheckResult } from "../proof/checks.ts";
import { complete } from "./model-client.ts";
import { gateLine, type Provenance } from "./post-filter.ts";

export interface TurningQuestion {
  text: string;
  findingRefs: string[];
  provenance: Provenance;
}

/** Findings worth a turning question: failed or missing, citing a clause. */
function contestedFindings(findings: CheckResult[]): CheckResult[] {
  return findings.filter(
    (f) => f.result === "fail" || f.result === "missing",
  );
}

/**
 * Phrase turning questions for the failed/contested findings. Calls the model
 * once with all contested findings in context. On degrade (timeout/error/filter
 * block) returns an empty array — the frame renders rung 2 (requirements +
 * unresolved only).
 */
export async function phraseTurningQuestions(
  caseContext: string,
  findings: CheckResult[],
): Promise<{ questions: TurningQuestion[]; degraded: boolean }> {
  const contested = contestedFindings(findings);
  if (contested.length === 0) {
    return { questions: [], degraded: false };
  }

  const findingsBlock = contested
    .map(
      (f) =>
        `- check: ${f.check} | expected: ${f.expected} | found: ${f.found} | result: ${f.result}${f.clauseRef ? ` | clause: ${f.clauseRef}` : ""} | ref: ${f.checkId}`,
    )
    .join("\n");

  const system = [
    "You are a clerk preparing a dispute file for a reviewer. You direct attention; you never decide.",
    "Phrase ONE short question per contested finding. Pose the question the case turns on; never answer it.",
    "Each question must cite the clause number and reference the finding. Plain language, under 25 words.",
    "Do not use outcome words (refund, reject, approve, release). Do not indicate which side is stronger.",
    "Return ONLY the questions, one per line, prefixed with the finding ref in brackets, e.g. '[grace_window:Video 3] Was video three delivered on time under clause 4?'",
  ].join(" ");

  const prompt = [
    `Case context: ${caseContext}`,
    "",
    "Contested findings:",
    findingsBlock,
    "",
    "Phrase one turning question per finding, citing the clause and the finding ref.",
  ].join("\n");

  const res = await complete({ task: "frame.turning_questions", system, prompt });

  if (res.degraded || !res.text) {
    return { questions: [], degraded: true };
  }

  // Parse the model's lines back into structured questions with findingRefs.
  const questions: TurningQuestion[] = [];
  for (const line of res.text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Extract a leading [ref] if present, else attach all contested refs.
    const refMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
    let text: string;
    let refs: string[];
    if (refMatch) {
      refs = refMatch[1].split(",").map((s) => s.trim());
      text = refMatch[2].trim();
    } else {
      refs = contested.map((f) => f.checkId);
      text = trimmed.replace(/^[-*]\s*/, "");
    }
    if (!text) continue;

    // Post-filter: drop outcome-word lines entirely (P6 covert-steer guard).
    const gated = gateLine(text, "model");
    if (gated.degrade) {
      console.warn("[frame-questions] dropping model line blocked by post-filter:", text.slice(0, 60));
      continue;
    }
    questions.push({
      text: gated.text,
      findingRefs: refs,
      provenance: "model",
    });
  }

  return { questions, degraded: false };
}
