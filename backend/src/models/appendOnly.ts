import type { Schema, Document } from "mongoose";

/* ============================================================================
   Append-only enforcement (P5, PRD §9.2, FIN-30).
   Three collections — Payout, Evidence, Decision — are append-only at the
   model layer. Mutations to immutable paths are rejected → HTTP 409. Only the
   declared lifecycle fields (the "mutable appendix") may be updated.

   Known bypass surface (documented for PH-3): bulkWrite/deleteMany/replaceOne
   and raw-driver access are not intercepted by mongoose middleware. Production
   posture: restricted DB user + schema validation.
   ========================================================================== */

export class AppendOnlyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppendOnlyViolationError";
  }
}

function touchesImmutable(update: Record<string, unknown>, immutablePaths: string[]): string | null {
  for (const op of Object.values(update)) {
    if (typeof op !== "object" || op === null) continue;
    for (const key of Object.keys(op)) {
      // match on the root of each dotted path (e.g. "recipientKey" matches "recipientKey.x")
      const root = key.split(".")[0];
      if (immutablePaths.includes(root)) return root;
    }
  }
  return null;
}

export function appendOnly(schema: Schema, entity: string, immutablePaths: string[]): void {
  // New documents are always allowed (creation).
  schema.pre<Document>("save", function (next) {
    if (this.isNew) return next();
    for (const path of immutablePaths) {
      if (this.isModified(path)) {
        return next(
          new AppendOnlyViolationError(
            `${entity} is append-only: ${path} cannot be changed. ` +
              "Corrections are added as new records, never edits (PRD §13.3).",
          ),
        );
      }
    }
    next();
  });

  schema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function (next) {
    const update = this.getUpdate() as Record<string, unknown> | null;
    if (!update || typeof update !== "object") return next();
    const hit = touchesImmutable(update, immutablePaths);
    if (hit) {
      return next(
        new AppendOnlyViolationError(
          `${entity} is append-only: ${hit} cannot be changed. ` +
            "Corrections are added as new records, never edits (PRD §13.3).",
        ),
      );
    }
    next();
  });

  // findOneAndReplace replaces the whole doc — reject unconditionally.
  schema.pre("findOneAndReplace", function (next) {
    next(
      new AppendOnlyViolationError(
        `${entity} is append-only: full replacement is not permitted. ` +
          "Corrections are added as new records, never edits (PRD §13.3).",
      ),
    );
  });
}
