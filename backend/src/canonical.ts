import sha3 from "js-sha3";
import { createHash } from "node:crypto";

/* ============================================================================
   Canonical serialization + hashing (PRD §9.4, FIN-19).
   The same logical value must serialize to the same bytes in every service or
   anchored hashes diverge. This implementation matches the rules in the PRD:
   - objects: keys sorted lexicographically (UTF-16) at every depth
   - undefined-valued properties skipped
   - arrays: order preserved
   - no whitespace
   - rejects: undefined/function/symbol/bigint as values, NaN, ±Infinity,
     circular references, non-plain objects (class instances, Date, Map)
   ========================================================================== */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  // plain object literal or null-prototype object — no Date/Map/Set/class
  return proto === Object.prototype || proto === null;
}

function canonicalize(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  const t = typeof value;

  if (t === "string") return JSON.stringify(value);
  if (t === "boolean") return value ? "true" : "false";
  if (t === "undefined") {
    throw new TypeError("canonicalize: undefined is not a permitted value");
  }
  if (t === "function" || t === "symbol") {
    throw new TypeError(`canonicalize: ${t} is not a permitted value`);
  }
  if (t === "bigint") {
    throw new TypeError("canonicalize: bigint is not a permitted value");
  }
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonicalize: non-finite numbers are not permitted");
    }
    return String(value);
  }

  // objects + arrays
  if (typeof value !== "object") {
    throw new TypeError(`canonicalize: unhandled type ${t}`);
  }
  if (!isPlainObject(value) && !Array.isArray(value)) {
    throw new TypeError("canonicalize: only plain objects and arrays are permitted");
  }
  if (seen.has(value)) {
    throw new TypeError("canonicalize: circular reference");
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item, seen));
    seen.delete(value);
    return `[${items.join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys
    .filter((k) => value[k] !== undefined) // absent and undefined are the same fact
    .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k], seen)}`);
  seen.delete(value);
  return `{${entries.join(",")}}`;
}

/** Canonical JSON string (no whitespace, keys sorted at every depth). */
export function canonicalizeJSON(value: unknown): string {
  return canonicalize(value, new Set());
}

/** keccak256 of the UTF-8 bytes of the canonical JSON — the hash anchored on chain. */
export function canonicalHash(value: unknown): string {
  const canon = canonicalizeJSON(value);
  return "0x" + sha3.keccak_256(canon);
}

/** sha256 hex of raw bytes/text — used for evidence fingerprints (server-side). */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}
