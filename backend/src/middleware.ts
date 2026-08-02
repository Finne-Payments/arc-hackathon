import type { Request, Response, NextFunction, RequestHandler } from "express";
import { can, type Permission, type SessionSeat, type Role } from "./rbac.ts";
import { HttpError } from "./errors.ts";
import { verifyToken } from "./auth.ts";
import { loadEnv } from "./env.ts";

/* ============================================================================
   Middleware (PRD §11). Chain: express.json → resolveSession →
   per-route requirePermission(p) | requireInternal(token) → handler →
   terminal error handler.

   resolveSession now verifies a JWT (Authorization: Bearer <token>) and
   populates SessionContext from the token payload. This replaced the seeded
   x-finne-session header — the documented D7/PH-1 swap point. Password =
   identity (off-chain); wallet = money (on-chain).
   ========================================================================== */

export interface SessionContext {
  userId: string | null;
  sessionId: SessionSeat | null;
  role: Role | null;
  displayName: string | null;
  walletAddress: string | null;
}

/** Attach a SessionContext to the request from the Authorization Bearer token. */
export function resolveSession(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.header("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.session = {
        userId: payload.userId,
        sessionId: roleToSeat(payload.role),
        role: payload.role,
        displayName: payload.displayName,
        walletAddress: null, // populated on demand from the User doc by routes that need it
      };
      next();
      return;
    }
  }

  // No valid token — anonymous (requirePermission will 401).
  req.session = { userId: null, sessionId: null, role: null, displayName: null, walletAddress: null };
  next();
}

/** Require a specific permission. 401 if no session, 403 if the seat lacks it. */
export function requirePermission(p: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = req.session;
    if (!ctx?.userId || !ctx.role) {
      return next(new HttpError(401, "Log in first — authentication required."));
    }
    if (!can(ctx.role, p)) {
      const seat = ctx.sessionId ?? ctx.role;
      return next(
        new HttpError(403, `The ${seat} role cannot do this (needs ${p}).`),
      );
    }
    next();
  };
}

/** Require any authenticated user (no specific permission). For routes like /auth/me. */
export function requireAuthenticated(req: Request, _res: Response, next: NextFunction): void {
  const ctx = req.session;
  if (!ctx?.userId) {
    return next(new HttpError(401, "Log in first — authentication required."));
  }
  next();
}

/** Internal-channel guard (indexer → backend). Always uses the real env loader. */
export function requireInternal(req: Request, _res: Response, next: NextFunction): void {
  const token = req.header("x-finne-internal");
  if (!token || token !== loadEnv().internalToken) {
    return next(new HttpError(403, "Internal endpoint."));
  }
  next();
}

/** The seat, as needed by handlers for role-conditional logic. */
export function currentRole(req: Request): Role | null {
  return req.session?.role ?? null;
}

export function currentSeat(req: Request): SessionSeat | null {
  return req.session?.sessionId ?? null;
}

/** Map a Role back to a transport seat (for session context). */
function roleToSeat(role: Role): SessionSeat | null {
  switch (role) {
    case "reviewer":
      return "reviewer";
    case "recipient":
      return "recipient";
    case "platform_viewer":
      return "platform";
    case "agent_service":
      return "agent";
    default:
      return null;
  }
}

// Augment Express's Request with our session (declared once here).
declare module "express-serve-static-core" {
  interface Request {
    session: SessionContext;
  }
}

export { can };
