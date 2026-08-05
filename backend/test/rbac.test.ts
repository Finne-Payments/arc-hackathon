import { describe, it, expect } from "vitest";
import { can, seatToRole, MATRIX, type Permission, type Role } from "../src/rbac.ts";

/* RBAC matrix tests (PRD §6.2) — the 14 permissions × 5 roles. */

const ALL_PERMISSIONS: Permission[] = [
  "workorder:create", "workorder:read", "payout:read", "case:open", "case:read",
  "case:respond", "case:add_evidence", "case:request_info", "case:decide",
  "evidence:download", "brief:read", "brief:write", "anchor:write", "demo:seed",
];

describe("RBAC matrix", () => {
  it("reviewer holds the decision + seed perms", () => {
    expect(can("reviewer", "case:decide")).toBe(true);
    expect(can("reviewer", "case:request_info")).toBe(true);
    expect(can("reviewer", "demo:seed")).toBe(true);
    expect(can("reviewer", "workorder:create")).toBe(true);
  });

  it("reviewer CAN respond (merchant seat needs to reply to info requests)", () => {
    expect(can("reviewer", "case:respond")).toBe(true);
  });

  it("recipient can open + respond + add evidence + preview docs, but cannot decide", () => {
    expect(can("recipient", "case:open")).toBe(true);
    expect(can("recipient", "case:respond")).toBe(true);
    expect(can("recipient", "case:add_evidence")).toBe(true);
    expect(can("recipient", "evidence:download")).toBe(true); // case party — can preview
    expect(can("recipient", "case:decide")).toBe(false);
  });

  it("platform_viewer is read-only across the board (not a case party)", () => {
    expect(can("platform_viewer", "case:read")).toBe(true);
    expect(can("platform_viewer", "payout:read")).toBe(true);
    expect(can("platform_viewer", "evidence:download")).toBe(false); // not a case party
    expect(can("platform_viewer", "case:decide")).toBe(false);
    expect(can("platform_viewer", "case:respond")).toBe(false);
  });

  it("agent_service can write briefs but cannot decide/respond/evidence", () => {
    expect(can("agent_service", "brief:write")).toBe(true);
    expect(can("agent_service", "case:decide")).toBe(false);
    expect(can("agent_service", "case:respond")).toBe(false);
    expect(can("agent_service", "case:add_evidence")).toBe(false);
  });

  it("registry_operator has exactly one permission (anchor:write)", () => {
    const held = ALL_PERMISSIONS.filter((p) => can("registry_operator", p));
    expect(held).toEqual(["anchor:write"]);
  });

  it("seatToRole maps every transport seat to a role", () => {
    expect(seatToRole("reviewer")).toBe("reviewer");
    expect(seatToRole("recipient")).toBe("recipient");
    expect(seatToRole("platform")).toBe("platform_viewer");
    expect(seatToRole("agent")).toBe("agent_service");
  });

  it("every role's permission set is a subset of the known permissions", () => {
    const roles: Role[] = ["reviewer", "recipient", "platform_viewer", "agent_service", "registry_operator"];
    for (const r of roles) {
      for (const p of MATRIX[r]) {
        expect(ALL_PERMISSIONS).toContain(p);
      }
    }
  });
});
