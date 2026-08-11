import type { Request, Response, NextFunction, RequestHandler } from "express";
import { can, seatToRole, type Permission, type SessionSeat, type Role } from "./rbac.ts";
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

/** Attach a SessionContext to the request from the Authorization Bearer token.
 * Self-heals stale JWTs: a token issued before the role split carries a legacy
 * role ("reviewer"/"recipient"). Rather than 401 every request (which traps the
 * user until they re-login), this looks up the user's CURRENT role from the DB
 * and uses it. The wallet-login handler also re-stamps the role on the next
 * login, so stale tokens disappear naturally as users return. */
export async function resolveSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = req.header("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const VALID_ROLES: Role[] = ["arbiter", "customer", "merchant", "platform_viewer", "agent_service", "registry_operator"];
      if (VALID_ROLES.includes(payload.role)) {
        // Fresh token — role is current.
        req.session = {
          userId: payload.userId,
          sessionId: roleToSeat(payload.role),
          role: payload.role,
          displayName: payload.displayName,
          walletAddress: null,
        };
        next();
        return;
      }
      // Stale token (legacy role) — self-heal from the DB so the user isn't
      // trapped in a 401 loop. The user's `seat` (arbiter/customer/merchant/
      // platform) is the durable identifier; if the stored `role` is also
      // legacy, derive the role from the seat. If the user no longer exists,
      // fall through to anonymous.
      try {
        const { User } = await import("./models/index.ts");
        const user = await User.findById(payload.userId).lean();
        if (user) {
          let role = user.role as Role;
          if (!VALID_ROLES.includes(role) && user.seat) {
            // Legacy role in the DB too — derive from the seat.
            role = seatToRole(user.seat as SessionSeat);
          }
          if (VALID_ROLES.includes(role)) {
            req.session = {
              userId: payload.userId,
              sessionId: roleToSeat(role),
              role,
              displayName: user.displayName ?? payload.displayName,
              walletAddress: null,
            };
            next();
            return;
          }
        }
      } catch {
        // DB lookup failed — fall through to anonymous (safer than guessing).
      }
    }
  }

  // No valid token, or stale token that couldn't be healed — anonymous.
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

/**
 * Chain-first invariant guard. A payout may ONLY be created as a consequence of
 * a real on-chain `pay()` detected by the indexer — never written straight to
 * the DB. Any money-mutating endpoint (new payout, open dispute) gated by this
 * middleware returns 503 when the RefundProtocol is not deployed, so the
 * off-chain record can never exist without its on-chain commitment. The DB is
 * a projection of the chain, never a substitute for it (PRD §9.4, §12).
 *
 * `which` selects the contract the action depends on:
 *   - "refundProtocol" — payouts, disputes (C1, holds USDC)
 *   - "registry"       — anchor-issuing endpoints (C2, FinnéCaseRegistry)
 */
export function requireChainConfigured(which: "refundProtocol" | "registry" = "refundProtocol"): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction) => {
    const env = loadEnv();
    const configured =
      which === "registry"
        ? !!env.arc.caseRegistryAddress
        : !!env.arc.refundProtocolAddress;
    if (!configured) {
      return next(
        new HttpError(
          503,
          which === "registry"
            ? "The FinneCaseRegistry contract isn't deployed yet — anchoring is disabled. Deploy the contracts first (see scripts/deploy-arc.sh)."
            : "The RefundProtocol contract isn't deployed yet — no payout can be created off chain. A payment must exist on Arc first (the indexer then builds the receipt). Deploy the contracts to enable payouts.",
        ),
      );
    }
    next();
  };
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
    case "arbiter":
      return "arbiter";
    case "customer":
      return "customer";
    case "merchant":
      return "merchant";
    case "platform_viewer":
      return "platform";
    case "agent_service":
      return "agent";
    case "registry_operator":
      return null;
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
