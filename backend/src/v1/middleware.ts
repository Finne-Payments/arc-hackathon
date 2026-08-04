/* ============================================================================
   v1 middleware — session resolution, permission checks, idempotency.
   BE-04 (controlled auth), BE-05 (invitation-bound wallet challenge),
   BE-06 (resource authorization), BE-07 (idempotency keys).
   ========================================================================== */

import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { can, type Role, type Permission } from "@finne/domain";
import type { Config } from "@finne/config";
import { unauthorized, forbidden, ApiError } from "./errors.ts";

export interface V1Session {
  userId: string;
  role: Role;
  tenantKey: string;
  displayName: string;
  walletAddress: string | null;
}

/** Augment Request with v1 session + requestId */
declare module "express-serve-static-core" {
  interface Request {
    v1session: V1Session | null;
  }
}

/** Resolve the session from the Bearer token (BE-04). */
export function resolveV1Session(config: Config) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      req.v1session = null;
      return next();
    }
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, config.sessionSecret) as {
        userId: string;
        role: Role;
        tenantKey: string;
        displayName: string;
        walletAddress: string | null;
      };
      req.v1session = {
        userId: payload.userId,
        role: payload.role,
        tenantKey: payload.tenantKey,
        displayName: payload.displayName,
        walletAddress: payload.walletAddress ?? null,
      };
    } catch {
      req.v1session = null;
    }
    next();
  };
}

/** Require an authenticated session. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.v1session) return next(unauthorized());
  next();
}

/** Require a specific permission (BE-06). */
export function requirePerm(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.v1session) return next(unauthorized());
    if (!can(req.v1session.role, permission)) {
      return next(forbidden(`The ${req.v1session.role} role cannot do this (needs ${permission}).`));
    }
    next();
  };
}

/** Require an Idempotency-Key header on retryable writes (BE-07). */
export function requireIdempotencyKey(req: Request, _res: Response, next: NextFunction) {
  const key = req.headers["idempotency-key"] as string | undefined;
  if (!key || key.length < 8) {
    return next(new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key header (min 8 chars) is required for this operation.", false));
  }
  next();
}

/** Require the internal token (indexer → backend channel). */
export function requireInternal(config: Config) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.headers["x-finne-internal"] as string | undefined;
    if (!token || token !== config.internalToken) {
      return next(forbidden("Internal endpoint."));
    }
    next();
  };
}
