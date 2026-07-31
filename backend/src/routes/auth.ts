import { Router } from "express";
import { User } from "../models/index.ts";
import {
  hashPassword,
  verifyPassword,
  createToken,
  type PublicUser,
} from "../auth.ts";
import { HttpError } from "../errors.ts";
import { resolveSession, type SessionContext } from "../middleware.ts";
import type { Role } from "../rbac.ts";

/* ============================================================================
   Auth routes — register, login, me, link-wallet.
   Password = identity (off-chain). Wallet = money (on-chain).
   ========================================================================== */

export const authRoutes = Router();

const VALID_ROLES: Role[] = ["reviewer", "recipient", "platform_viewer"];

function toPublic(u: any): PublicUser {
  return {
    id: u._id.toString(),
    email: u.email,
    role: u.role,
    displayName: u.displayName,
    platformKey: u.platformKey,
    walletAddress: u.walletAddress,
  };
}

// POST /auth/register
authRoutes.post("/auth/register", async (req, res, next) => {
  try {
    const { email, password, role, displayName, platformKey } = req.body ?? {};
    if (!email || !password) throw new HttpError(400, "Email and password are required.");
    if (!VALID_ROLES.includes(role)) throw new HttpError(400, "Role must be reviewer, recipient, or platform_viewer.");

    const existing = await User.findOne({ email });
    if (existing) throw new HttpError(409, "An account with that email already exists.");

    const passwordHash = await hashPassword(String(password));
    const user = await User.create({
      email: String(email),
      passwordHash,
      role,
      displayName: displayName || email,
      platformKey: platformKey || "northbeam",
      walletAddress: null,
    });

    const pub = toPublic(user);
    const token = createToken({ userId: pub.id, role: pub.role, displayName: pub.displayName });
    res.status(201).json({ token, user: pub });
  } catch (e) {
    next(e);
  }
});

// POST /auth/login
authRoutes.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) throw new HttpError(400, "Email and password are required.");

    const user = await User.findOne({ email: String(email) });
    if (!user) throw new HttpError(401, "Invalid email or password.");

    const ok = await verifyPassword(String(password), user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid email or password.");

    const pub = toPublic(user);
    const token = createToken({ userId: pub.id, role: pub.role, displayName: pub.displayName });
    res.json({ token, user: pub });
  } catch (e) {
    next(e);
  }
});

// GET /auth/me — requires a valid session
authRoutes.get("/auth/me", resolveSession, async (req, res, next) => {
  try {
    const ctx = req.session as SessionContext;
    if (!ctx.userId) throw new HttpError(401, "Not authenticated.");
    const user = await User.findById(ctx.userId);
    if (!user) throw new HttpError(401, "User not found.");
    res.json({ user: toPublic(user) });
  } catch (e) {
    next(e);
  }
});

// POST /auth/link-wallet — links the connected wallet address to the user
authRoutes.post("/auth/link-wallet", resolveSession, async (req, res, next) => {
  try {
    const ctx = req.session as SessionContext;
    if (!ctx.userId) throw new HttpError(401, "Not authenticated.");
    const { walletAddress } = req.body ?? {};
    if (!walletAddress) throw new HttpError(400, "walletAddress is required.");

    await User.updateOne({ _id: ctx.userId }, { $set: { walletAddress: String(walletAddress) } });
    const user = await User.findById(ctx.userId);
    res.json({ user: toPublic(user) });
  } catch (e) {
    next(e);
  }
});

// POST /auth/logout — client-side only (just drop the token); here for completeness
authRoutes.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});
