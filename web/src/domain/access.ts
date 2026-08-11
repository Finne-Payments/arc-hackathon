import type { Role, Screen } from "../types";

/* ============================================================================
   Role-based route access (single source of truth).
   Each role has a HOME screen and a set of ALLOWED screens. Both the router
   (App.tsx) and the view-model (useFinne.ts) import from here so there is one
   definition, not three divergent copies.
   ========================================================================== */

// Standard-commerce nomenclature: customer = payer (creates payouts, opens
// disputes), merchant = payment recipient (responds, withdraws). The customer's
// home is the ledger (it creates payouts); the merchant's home is the recipient
// home (it receives payouts).
export const ROLE_HOME: Record<Role, Screen> = {
  arbiter: "disputes",
  merchant: "home",
  customer: "ledger",
  platform: "platform",
};

export const ROLE_ALLOWED: Record<Role, Screen[]> = {
  arbiter: ["disputes", "case", "decision", "receipt", "final"],
  merchant: ["home", "disputes", "case", "receipt", "final"],
  customer: ["ledger", "newpayout", "disputes", "case", "receipt", "final"],
  platform: ["platform", "disputes", "case", "receipt", "final"],
};

export function isAllowed(role: Role, screen: string | null | undefined): boolean {
  if (!screen) return false;
  return ROLE_ALLOWED[role].includes(screen as Screen);
}

export function homeScreenForRole(role: Role): Screen {
  return ROLE_HOME[role];
}
