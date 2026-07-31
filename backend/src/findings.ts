/* ============================================================================
   Agent brief verdict-guard (P1, PRD §13.3, FIN-45).
   The agent's brief contains FINDINGS ONLY — no recommendation, verdict,
   outcome, decision or similar. Forbidden key patterns are rejected recursively
   at any depth → HTTP 422. Check fields are allow-listed.

   Three layers defend this: (1) this schema guard, (2) the brief Mongoose
   schema `strict:'throw'`, (3) CI import ban in the agent package (not in this
   build's scope).
   ========================================================================== */

export class ForbiddenFindingFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenFindingFieldError";
  }
}

export class InvalidBriefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBriefError";
  }
}

// Verdict-shaped keys are forbidden at any depth (case-insensitive).
export const FORBIDDEN_KEY_PATTERN =
  /recommend|verdict|outcome|decision|approve|reject|refund|suggest|advis|conclusion|ruling/i;

// Check objects may carry only these fields.
const ALLOWED_CHECK_FIELDS = new Set(["check", "expected", "found", "result"]);
const ALLOWED_RESULT_VALUES = new Set(["pass", "fail", "missing"]);

export interface BriefPayload {
  caseRef?: string | null;
  payoutRef: string;
  checks: { check: string; expected: string; found: string; result: string }[];
  inconsistencies: string[];
  missingItems: string[];
}

/** Reject any verdict-shaped key recursively; enforce check field allow-list. */
export function validateBriefPayload(payload: unknown): asserts payload is BriefPayload {
  if (!payload || typeof payload !== "object") {
    throw new InvalidBriefError("Brief payload must be an object.");
  }
  scanKeys(payload, []);

  const p = payload as Record<string, unknown>;
  if (typeof p.payoutRef !== "string" || !p.payoutRef) {
    throw new InvalidBriefError("Brief payload requires a payoutRef.");
  }
  if (!Array.isArray(p.checks)) throw new InvalidBriefError("Brief payload requires a checks array.");
  for (const c of p.checks) {
    if (!c || typeof c !== "object") throw new InvalidBriefError("Each check must be an object.");
    const keys = Object.keys(c);
    for (const k of keys) {
      if (!ALLOWED_CHECK_FIELDS.has(k)) {
        throw new InvalidBriefError(`Check field "${k}" is not allowed. Only ${[...ALLOWED_CHECK_FIELDS].join(", ")} permitted.`);
      }
    }
    if (!ALLOWED_RESULT_VALUES.has(String((c as Record<string, unknown>).result))) {
      throw new InvalidBriefError(`Check result must be one of ${[...ALLOWED_RESULT_VALUES].join(", ")}.`);
    }
  }
  if (!Array.isArray(p.inconsistencies) || !Array.isArray(p.missingItems)) {
    throw new InvalidBriefError("Brief payload requires inconsistencies and missingItems arrays.");
  }
}

function scanKeys(value: unknown, path: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanKeys(v, [...path, String(i)]));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY_PATTERN.test(k)) {
        throw new ForbiddenFindingFieldError(
          `Brief contains a forbidden field "${k}" at ${path.concat(k).join(".")} — ` +
            "the agent reports findings only; it does not decide (P1).",
        );
      }
      scanKeys(v, [...path, k]);
    }
  }
}
