/* ============================================================================
   RBAC matrix — the single choke point (PRD §6.2).
   Permissions across six roles. `can(role, permission)` is called by every
   guarded route via `requirePermission(p)`. No route invents its own access
   check.

   Roles: arbiter · customer · merchant · platform_viewer · agent_service ·
   registry_operator. Roles are 1:1 with frontend seats. arbiter/customer/
   merchant have browser seats; the agent is a service process, the
   registry_operator is the in-process anchor worker. Both exist so the matrix
   stays complete when those move out of process in PH-1/PH-4).
   ========================================================================== */

export type Permission =
  | "workorder:create"
  | "workorder:read"
  | "payout:create"
  | "payout:read"
  | "case:open"
  | "case:read"
  | "case:respond"
  | "case:add_evidence"
  | "case:request_info"
  | "case:decide"
  | "evidence:download"
  | "brief:read"
  | "brief:write"
  | "anchor:write"
  | "demo:seed";

/* Roles are now 1:1 with frontend seats. The merged `reviewer` blob (which
 * previously held arbiter + merchant + customer perms and could not tell them
 * apart) is split into three distinct roles. Standard-commerce nomenclature:
 *   arbiter  — decides refunds, signs on-chain
 *   customer — the PAYER: creates payouts, OPENS disputes (the only role that
 *              can), adds evidence. Refunds return money to the customer.
 *   merchant — the PAYEE / payment recipient: responds to disputes, adds
 *              evidence, withdraws. Cannot open disputes.
 * platform_viewer / agent_service / registry_operator are unchanged. */
export type Role =
  | "arbiter"
  | "customer"
  | "merchant"
  | "platform_viewer"
  | "agent_service"
  | "registry_operator";

/** Transport seat derived from the authenticated role (PH-1: JWT, was D7 header). */
export type SessionSeat = "arbiter" | "customer" | "merchant" | "platform" | "agent";

export const MATRIX: Record<Role, Permission[]> = {
  // Arbiter: reviews, requests info, decides + signs refunds. Can also send
  // messages in the case (case:respond) so all three parties can communicate.
  arbiter: [
    "workorder:read",
    "payout:read",
    "case:read",
    "case:respond",
    "case:request_info",
    "case:decide",
    "evidence:download",
    "brief:read",
    "demo:seed",
  ],
  // Customer (payer): the ONLY role that can open a dispute. Also creates
  // payouts and adds evidence to its own cases.
  customer: [
    "workorder:create",
    "payout:create",
    "payout:read",
    "case:open",
    "case:read",
    "case:respond",
    "case:add_evidence",
    "evidence:download",
    "brief:read",
  ],
  // Merchant (payment recipient): responds to disputes, adds evidence.
  merchant: [
    "workorder:read",
    "payout:read",
    "case:read",
    "case:respond",
    "case:add_evidence",
    "evidence:download",
    "brief:read",
  ],
  platform_viewer: ["workorder:read", "payout:read", "case:read", "brief:read"],
  agent_service: ["workorder:read", "payout:read", "case:read", "brief:read", "brief:write"],
  registry_operator: ["anchor:write"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

/** Map a transport seat to a Role (the inverse of middleware.roleToSeat). */
export function seatToRole(seat: SessionSeat): Role {
  switch (seat) {
    case "arbiter":
      return "arbiter";
    case "customer":
      return "customer";
    case "merchant":
      return "merchant";
    case "platform":
      return "platform_viewer";
    case "agent":
      return "agent_service";
  }
}
