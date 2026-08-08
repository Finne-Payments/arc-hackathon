/* ============================================================================
   England & Wales contract templates for New Payout.

   A merchant picks one to pre-fill the description + deliverables (and a
   governing-law note), then edits before paying. These are starting points,
   not legal advice — the disclaimer below mirrors the one rendered in the case
   room's law library (FIN-112). Jurisdiction is England & Wales to match the
   seeded governing-law pack (ADR 0007 / docs/law-lines).
   ========================================================================== */

export interface ContractTemplate {
  id: string;
  label: string;
  /** Short description of when to use this template. */
  hint: string;
  /** Pre-fills the "What it's for" field. */
  description: string;
  /** Pre-fills the deliverables list. Each has a name + a due date offset (days
   *  from today) so the dates are relative to when the merchant creates the
   *  payout, not a frozen absolute date. */
  deliverables: { name: string; dueInDays: number }[];
  /** The governing-law note shown beside the picker — ties to the case-room law
   *  library. Plain-language, neutral (describes what the law provides). */
  governingLawNote: string;
}

const E_W_NOTE =
  "Governed by the law of England & Wales. A buyer who has had a reasonable opportunity to examine the work is deemed to have accepted it after a reasonable time, and the right to reject is lost on acceptance — a refund after acceptance is a claim requiring grounds, not a self-help reversal.";

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id: "ew-content-production",
    label: "Content production (E&W)",
    hint: "Videos, creative, or media deliverables — the demo scenario.",
    description: "Content production — deliverables as listed, payable on acceptance.",
    deliverables: [
      { name: "Deliverable 1 — first cut for review", dueInDays: 7 },
      { name: "Deliverable 2 — revisions", dueInDays: 14 },
      { name: "Deliverable 3 — final master files", dueInDays: 21 },
    ],
    governingLawNote: E_W_NOTE,
  },
  {
    id: "ew-software-milestone",
    label: "Software milestone (E&W)",
    hint: "Phased dev work paid against milestone acceptance.",
    description: "Software development — milestone-based, payable on acceptance of each milestone.",
    deliverables: [
      { name: "Milestone 1 — design + architecture sign-off", dueInDays: 10 },
      { name: "Milestone 2 — build + integration", dueInDays: 30 },
      { name: "Milestone 3 — UAT + handover", dueInDays: 45 },
    ],
    governingLawNote: E_W_NOTE,
  },
  {
    id: "ew-professional-services",
    label: "Professional services (E&W)",
    hint: "Consulting / advisory billed on completion.",
    description: "Professional services — scope as agreed, payable on completion.",
    deliverables: [
      { name: "Engagement — discovery + scope", dueInDays: 5 },
      { name: "Delivery — work product / report", dueInDays: 20 },
    ],
    governingLawNote: E_W_NOTE,
  },
];

/** Format a due date offset (days from now) as a YYYY-MM-DD string for the date
 *  input. Returns "" for non-positive offsets (no date). */
export function dueDateFromOffset(days: number): string {
  if (!days || days <= 0) return "";
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
