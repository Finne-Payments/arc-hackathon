import type { Role, Screen } from "../types";

/* ============================================================================
   Role-based route access (single source of truth).
   Each role has a HOME screen and a set of ALLOWED screens. Both the router
   (App.tsx) and the view-model (useFinne.ts) import from here so there is one
   definition, not three divergent copies.
   ========================================================================== */

export const ROLE_HOME: Record<Role, Screen> = {
  arbiter: "disputes",
  merchant: "ledger",
  customer: "home",
  platform: "platform",
};

export const ROLE_ALLOWED: Record<Role, Screen[]> = {
  arbiter: ["disputes", "case", "decision", "receipt", "final"],
  merchant: ["ledger", "newpayout", "disputes", "case", "receipt", "final"],
  customer: ["home", "disputes", "case", "receipt", "final"],
  platform: ["platform", "disputes", "case", "receipt", "final"],
};

export function isAllowed(role: Role, screen: string | null | undefined): boolean {
  if (!screen) return false;
  return ROLE_ALLOWED[role].includes(screen as Screen);
}

export function homeScreenForRole(role: Role): Screen {
  return ROLE_HOME[role];
}
