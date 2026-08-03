/* ============================================================================
   RBAC matrix — the single choke point (PRD §6.2).
   Thirteen permissions across five roles. `can(role, permission)` is called by
   every guarded route via `requirePermission(p)`. No route invents its own
   access check.

   Roles: reviewer · recipient · platform_viewer · agent_service · registry_operator
   (The last two have no browser seat; the agent is a service process, the
   registry_operator is the in-process anchor worker. Both exist so the matrix
   stays complete when those move out of process in PH-1/PH-4.)
   ========================================================================== */

export type Permission =
  | "workorder:create"
  | "workorder:read"
  | "payout:read"
  | "case:open"
  | "case:read"
  | "case:respond"
  | "case:add_evidence"
  | "case:request_info"
  | "case:decide"
  | "brief:read"
  | "brief:write"
  | "anchor:write"
  | "demo:seed";

export type Role =
  | "reviewer"
  | "recipient"
  | "platform_viewer"
  | "agent_service"
  | "registry_operator";

/** Transport seat derived from the authenticated role (PH-1: JWT, was D7 header). */
export type SessionSeat = "reviewer" | "recipient" | "platform" | "agent";

export const MATRIX: Record<Role, Permission[]> = {
  reviewer: [
    "workorder:create",
    "workorder:read",
    "payout:read",
    "case:open",
    "case:read",
    "case:add_evidence",
    "case:request_info",
    "case:decide",
    "brief:read",
    "demo:seed",
  ],
  recipient: ["workorder:read", "payout:read", "case:open", "case:read", "case:respond", "case:add_evidence", "brief:read"],
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
    case "reviewer":
      return "reviewer";
    case "recipient":
      return "recipient";
    case "platform":
      return "platform_viewer";
    case "agent":
      return "agent_service";
  }
}
