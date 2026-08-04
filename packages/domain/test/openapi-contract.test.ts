/* ============================================================================
   OpenAPI contract test (FND-03) — freezes the 36 canonical operations and
   validates that the spec is well-formed. Run on every CI.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

const SPEC_PATH = resolve(__dirname, "../../../openapi/finne-v1.yaml");
const spec = YAML.parse(readFileSync(SPEC_PATH, "utf8"));

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Extract all operations with their canonical number from the summary. */
function extractOperations(): Array<{ num: number; method: string; path: string }> {
  const ops: Array<{ num: number; method: string; path: string }> = [];
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = (methods as Record<string, { summary?: string }>)[method];
      if (!op?.summary) continue;
      const match = op.summary.match(/\((\d+)\)\s*$/);
      if (match) {
        ops.push({ num: Number(match[1]), method: method.toUpperCase(), path });
      }
    }
  }
  return ops.sort((a, b) => a.num - b.num);
}

describe("OpenAPI contract (FND-03)", () => {
  it("is valid OpenAPI 3.1", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBeTruthy();
    expect(spec.paths).toBeDefined();
  });

  it("defines exactly 36 canonical operations numbered 1–36", () => {
    const ops = extractOperations();
    expect(ops).toHaveLength(36);
    const nums = ops.map((o) => o.num);
    for (let i = 0; i < 36; i++) {
      expect(nums[i]).toBe(i + 1);
    }
  });

  it("every retryable write (POST) accepts an Idempotency-Key", () => {
    const ops = extractOperations().filter((o) => o.method === "POST");
    // Public endpoints (challenges, sessions, webhook) are exempt per the spec
    const exempt = [
      "/v1/auth/recipient/challenges",
      "/v1/auth/recipient/sessions",
      "/v1/webhooks/circle",
    ];
    for (const op of ops) {
      if (exempt.includes(op.path)) continue;
      const params = spec.paths[op.path].post.parameters ?? [];
      // Params may be inline { name } or { $ref: "#/.../IdempotencyKey" }
      const hasIdem = params.some(
        (p: { name?: string; $ref?: string }) =>
          p.name === "Idempotency-Key" || (p.$ref ?? "").includes("IdempotencyKey"),
      );
      expect({ path: op.path, hasIdem }).toEqual({ path: op.path, hasIdem: true });
    }
  });

  it("uses the canonical error envelope on error responses", () => {
    const components = spec.components ?? {};
    const responses = components.responses ?? {};
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const op = (methods as Record<string, Record<string, unknown>>)[method];
        const opResponses = op?.responses as Record<string, Record<string, unknown>> | undefined;
        if (!opResponses) continue;
        for (const [code, respRef] of Object.entries(opResponses)) {
          if (Number(code) < 400) continue;
          // Resolve $ref to the named response, then read its content schema
          let resp = respRef;
          const ref0 = resp["$ref"] as string | undefined;
          if (ref0) {
            const name = ref0.split("/").pop() as string;
            resp = (responses[name] ?? {}) as Record<string, unknown>;
          }
          const content = resp["content"] as { "application/json"?: { schema?: { $ref?: string } } } | undefined;
          const ref = content?.["application/json"]?.schema?.$ref;
          expect({ code, ref }).toEqual({ code, ref: "#/components/schemas/Error" });
        }
      }
    }
  });

  it("no operation name contains escrow/refund/debt/withdrawal in the summary", () => {
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const op = (methods as Record<string, { summary?: string }>)[method];
        if (!op?.summary) continue;
        expect(op.summary.toLowerCase()).not.toMatch(/\b(escrow|refund|debt|withdrawal|clawback)\b/);
      }
    }
  });
});
