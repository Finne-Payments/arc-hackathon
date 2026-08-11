import { describe, it, expect } from "vitest";
import { can, seatToRole, MATRIX, type Permission, type Role } from "../src/rbac.ts";

/* RBAC matrix tests (PRD §6.2). Roles are now 1:1 with frontend seats and use
 * standard-commerce nomenclature: arbiter decides refunds; customer (payer) is
 * the ONLY dispute opener; merchant (payment recipient) responds. */

const ALL_PERMISSIONS: Permission[] = [
  "workorder:create", "workorder:read", "payout:create", "payout:read", "case:open", "case:read",
  "case:respond", "case:add_evidence", "case:request_info", "case:decide",
  "evidence:download", "brief:read", "brief:write", "anchor:write", "demo:seed",
];

describe("RBAC matrix", () => {
  it("arbiter holds the decision + request-info + seed perms", () => {
    expect(can("arbiter", "case:decide")).toBe(true);
    expect(can("arbiter", "case:request_info")).toBe(true);
    expect(can("arbiter", "demo:seed")).toBe(true);
  });

  it("arbiter CANNOT open disputes or create payouts, but CAN respond (all parties communicate)", () => {
    expect(can("arbiter", "case:open")).toBe(false);
    expect(can("arbiter", "payout:create")).toBe(false);
    expect(can("arbiter", "case:respond")).toBe(true);
  });

  it("customer (payer) is the ONLY role that can open a dispute + create payouts", () => {
    expect(can("customer", "case:open")).toBe(true);
    expect(can("customer", "payout:create")).toBe(true);
    expect(can("customer", "case:add_evidence")).toBe(true);
    expect(can("customer", "evidence:download")).toBe(true);
    // customer cannot decide but CAN respond (both parties communicate in a dispute)
    expect(can("customer", "case:decide")).toBe(false);
    expect(can("customer", "case:respond")).toBe(true);
  });

  it("merchant (payment recipient) can respond + add evidence, but NOT open disputes or decide", () => {
    expect(can("merchant", "case:respond")).toBe(true);
    expect(can("merchant", "case:add_evidence")).toBe(true);
    expect(can("merchant", "evidence:download")).toBe(true);
    expect(can("merchant", "case:open")).toBe(false);
    expect(can("merchant", "case:decide")).toBe(false);
    expect(can("merchant", "payout:create")).toBe(false);
  });

  it("only the customer role holds case:open across the whole matrix", () => {
    const openers = (Object.keys(MATRIX) as Role[]).filter((r) => can(r, "case:open"));
    expect(openers).toEqual(["customer"]);
  });

  it("platform_viewer is read-only across the board (not a case party)", () => {
    expect(can("platform_viewer", "case:read")).toBe(true);
    expect(can("platform_viewer", "payout:read")).toBe(true);
    expect(can("platform_viewer", "evidence:download")).toBe(false); // not a case party
    expect(can("platform_viewer", "case:decide")).toBe(false);
    expect(can("platform_viewer", "case:respond")).toBe(false);
    expect(can("platform_viewer", "case:open")).toBe(false);
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

  it("seatToRole maps every transport seat to a role (1:1)", () => {
    expect(seatToRole("arbiter")).toBe("arbiter");
    expect(seatToRole("customer")).toBe("customer");
    expect(seatToRole("merchant")).toBe("merchant");
    expect(seatToRole("platform")).toBe("platform_viewer");
    expect(seatToRole("agent")).toBe("agent_service");
  });

  it("every role's permission set is a subset of the known permissions", () => {
    const roles: Role[] = ["arbiter", "customer", "merchant", "platform_viewer", "agent_service", "registry_operator"];
    for (const r of roles) {
      for (const p of MATRIX[r]) {
        expect(ALL_PERMISSIONS).toContain(p);
      }
    }
  });
});
