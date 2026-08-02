import { Router } from "express";
import { User } from "../models/index.ts";
import {
  hashPassword,
  verifyPassword,
  createToken,
  type PublicUser,
} from "../auth.ts";
import { HttpError } from "../errors.ts";
import { requireAuthenticated } from "../middleware.ts";
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

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, role]
 *             properties:
 *               email: { type: string, example: "dana@northbeam.com" }
 *               password: { type: string, example: "password123" }
 *               role: { type: string, enum: [reviewer, recipient, platform_viewer] }
 *               displayName: { type: string, example: "Dana Whitfield" }
 *               platformKey: { type: string, example: "northbeam" }
 *     responses:
 *       201: { description: Account created, returns JWT + user }
 *       409: { description: Email already exists }
 *       400: { description: Missing fields or invalid role }
 */
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

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email + password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: JWT token + user profile }
 *       401: { description: Invalid email or password }
 */
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

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user profile }
 *       401: { description: Not authenticated }
 */
// GET /auth/me — requires authentication
authRoutes.get("/auth/me", requireAuthenticated, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) throw new HttpError(401, "User not found.");
    res.json({ user: toPublic(user) });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /auth/link-wallet:
 *   post:
 *     tags: [Auth]
 *     summary: Link a browser wallet address to the authenticated user
 *     description: Required before blockchain actions (refund signing, withdraw).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [walletAddress]
 *             properties:
 *               walletAddress: { type: string, example: "0x4B21...9d3E" }
 *     responses:
 *       200: { description: Updated user profile with wallet linked }
 *       401: { description: Not authenticated }
 */
// POST /auth/link-wallet
authRoutes.post("/auth/link-wallet", requireAuthenticated, async (req, res, next) => {
  try {
    const { walletAddress } = req.body ?? {};
    if (!walletAddress) throw new HttpError(400, "walletAddress is required.");

    await User.updateOne({ _id: req.session.userId }, { $set: { walletAddress: String(walletAddress) } });
    const user = await User.findById(req.session.userId);
    res.json({ user: toPublic(user) });
  } catch (e) {
    next(e);
  }
});

// POST /auth/logout — client-side only (just drop the token); here for completeness
authRoutes.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});
