/* ============================================================================
   Actor roles — the single source of truth for "who can do what" in Finné.
   Backend RBAC and web route guards both import from here. No screen or route
   invents its own role set.

   The registrar model replaces the old merchant/customer/arbiter vocabulary
   with operations, reviewer, recipient, agent, and system — matching the
   FND-03 / BE-04 / BE-06 permissions.
   ========================================================================== */

/** Backend authorization roles (the RBAC matrix is keyed by these). */
export type Role =
  | "operations"
  | "reviewer"
  | "recipient"
  | "agent"
  | "system";

/** Human-facing seat labels for the web app. */
export const ROLE_LABELS: Record<Role, string> = {
  operations: "Operations",
  reviewer: "Human reviewer",
  recipient: "Recipient",
  agent: "Proof Agent (system)",
  system: "System (internal)",
};

/** Short human title for identity pills / headers. */
export const ROLE_TITLES: Record<Role, string> = {
  operations: "Platform operations",
  reviewer: "Named human reviewer",
  recipient: "Recipient",
  agent: "Proof Agent",
  system: "System",
};

/** Permissions — each mutating route names exactly one. */
export type Permission =
  // payments / receipts
  | "payment:import"
  | "payment:read"
  | "payment:approve-proof"
  | "payment:anchor"
  // demo payout
  | "demo:payout"
  // cases
  | "case:open"
  | "case:read"
  | "case:respond"
  | "case:add-evidence"
  | "case:request-info"
  | "case:decide"
  | "case:advance-deadline"
  // invitations
  | "invitation:create"
  // evidence
  | "evidence:upload"
  | "evidence:download"
  // agent / analysis
  | "analysis:run"
  | "analysis:approve"
  | "analysis:read"
  // decisions
  | "decision:read"
  // corrections
  | "correction:instruction"
  | "correction:read"
  | "correction:wallet-intent"
  | "correction:submit"
  | "correction:decline"
  | "correction:verify"
  // jobs / meta
  | "job:read"
  | "meta:read"
  // registry anchor (system / worker)
  | "anchor:write";

/**
 * The RBAC matrix. `can(role, permission)` is the single choke point.
 *
 * Deliberate asymmetries (matching BE-06):
 *  - reviewer CANNOT respond to a case (case:respond is recipient-only).
 *  - agent CANNOT decide, respond, or add evidence.
 *  - operations CANNOT decide or respond (decisions are reviewer-only;
 *    responses are recipient-only).
 *  - recipient CANNOT open a case or run analysis.
 */
export const RBAC_MATRIX: Record<Role, Permission[]> = {
  operations: [
    "payment:import",
    "payment:read",
    "payment:anchor",
    "demo:payout",
    "case:open",
    "case:read",
    "case:add-evidence",
    "case:request-info",
    "case:advance-deadline",
    "invitation:create",
    "evidence:upload",
    "evidence:download",
    "analysis:read",
    "decision:read",
    "correction:instruction",
    "correction:read",
    "correction:verify",
    "job:read",
    "meta:read",
  ],
  reviewer: [
    "payment:read",
    "case:read",
    "case:add-evidence",
    "case:request-info",
    "case:decide",
    "evidence:download",
    "analysis:run",
    "analysis:approve",
    "analysis:read",
    "decision:read",
    "correction:read",
    "job:read",
  ],
  recipient: [
    "payment:read",
    "case:read",
    "case:respond",
    "case:add-evidence",
    "evidence:upload",
    "evidence:download",
    "analysis:read",
    "decision:read",
    "correction:read",
    "correction:wallet-intent",
    "correction:submit",
    "correction:decline",
    "job:read",
  ],
  agent: [
    "payment:read",
    "case:read",
    "analysis:read",
  ],
  system: [
    "anchor:write",
    "job:read",
    "meta:read",
  ],
};

/** The single permission check. Every mutating route calls this. */
export function can(role: Role, permission: Permission): boolean {
  return RBAC_MATRIX[role]?.includes(permission) ?? false;
}

/** All permissions, for tooling / OpenAPI generation. */
export const ALL_PERMISSIONS: Permission[] = Object.values(
  // de-duplicate
  Array.from(new Set(Object.values(RBAC_MATRIX).flat())) as Permission[],
);
