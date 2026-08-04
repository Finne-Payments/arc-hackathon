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
   Auth routes — register, login, me, link-wallet, wallet.
   Two identity paths:
     - Wallet (primary): the connected browser wallet's address IS the identity.
       No password, no external service. The wallet still signs every on-chain
       action, so the backend holds no signing keys.
     - Password (legacy): demo accounts (reviewer / recipient / viewer).
   ========================================================================== */

export const authRoutes = Router();

const VALID_ROLES: Role[] = ["reviewer", "recipient", "platform_viewer"];

// Frontend seats. These are finer-grained than backend roles: arbiter and
// merchant both map to `reviewer`, so binding is enforced at the seat level to
// keep one wallet locked to exactly one seat.
const VALID_SEATS = ["arbiter", "merchant", "customer", "platform"] as const;
type Seat = (typeof VALID_SEATS)[number];

function seatToBackendRole(seat: string): "reviewer" | "recipient" | "platform_viewer" {
  switch (seat) {
    case "arbiter":
    case "merchant":
      return "reviewer";
    case "customer":
      return "recipient";
    case "platform":
      return "platform_viewer";
    default:
      return "recipient";
  }
}

function toPublic(u: any): PublicUser {
  return {
    id: u._id.toString(),
    email: u.email,
    role: u.role,
    seat: u.seat ?? null,
    displayName: u.displayName,
    platformKey: u.platformKey,
    walletAddress: u.walletAddress ?? null,
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
 *               email: { type: string, example: "dana@northstar.com" }
 *               password: { type: string, example: "password123" }
 *               role: { type: string, enum: [reviewer, recipient, platform_viewer] }
 *               displayName: { type: string, example: "Dana Whitfield" }
 *               platformKey: { type: string, example: "northstar" }
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
      platformKey: platformKey || "northstar",
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

    // Privy-only accounts have no password hash → password login is not allowed.
    if (!user.passwordHash) throw new HttpError(401, "Invalid email or password.");
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

/**
 * @openapi
 * /auth/wallet:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in (or sign up) with a connected wallet address
 *     description: >
 *       Primary login path. The browser wallet (MetaMask/Rabby) connects
 *       client-side via Viem; its address is sent here. The backend
 *       find-or-creates the user keyed by `walletAddress` (case-insensitive),
 *       assigns the requested `role` on first sign-in (default `recipient`),
 *       and returns a Finné JWT. Returning users keep their stored role. No
 *       password, no external service, no server-held keys — the wallet itself
 *       signs every on-chain action.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [walletAddress]
 *             properties:
 *               walletAddress: { type: string, example: "0x4B21...9d3E" }
 *               seat: { type: string, enum: [arbiter, merchant, customer, platform] }
 *     responses:
 *       200: { description: Finné JWT + user profile }
 *       400: { description: Missing walletAddress }
 *       409: { description: Wallet already registered with a different seat }
 */
// POST /auth/wallet — wallet-address login (no password, no external service).
// One wallet is bound to exactly one frontend seat: on first sign-in the
// requested seat sticks; thereafter the same wallet may only sign in with that
// seat. A mismatch is refused (409) — including across arbiter/merchant, which
// share the backend `reviewer` role but are distinct seats here.
authRoutes.post("/auth/wallet", async (req, res, next) => {
  try {
    const { walletAddress, seat } = req.body ?? {};
    if (!walletAddress) throw new HttpError(400, "walletAddress is required.");

    // Normalize to lowercase. Stored addresses are sometimes EIP-55 checksummed
    // (the seeded demo users are), so look up case-insensitively — this is what
    // binds one wallet to one pre-seeded user/role. Without it, a checksum
    // mismatch would silently create a fresh user with the wrong role.
    const addr = String(walletAddress).toLowerCase();
    const requestedSeat: Seat | null = (VALID_SEATS as readonly string[]).includes(seat) ? (seat as Seat) : null;
    const desiredSeat: Seat = requestedSeat ?? "customer";
    const addrRegex = new RegExp(`^${addr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

    let user = await User.findOne({ walletAddress: { $regex: addrRegex } });
    if (user) {
      // Returning wallet — its seat is fixed. If the client asked for a
      // different seat, refuse: one wallet is bound to exactly one seat.
      if (user.seat && requestedSeat && requestedSeat !== user.seat) {
        throw new HttpError(
          409,
          `This wallet is already registered as ${user.seat}. Sign in with that role, or connect a different wallet for ${requestedSeat}.`,
        );
      }
      // Legacy user created before seats existed → backfill the seat + role.
      if (!user.seat) {
        user.seat = desiredSeat;
        user.role = seatToBackendRole(desiredSeat);
        await user.save();
      }
    } else {
      // First sign-in with this wallet → create the account and bind it to the
      // requested seat (default customer). From now on this wallet is locked to
      // that seat. Synthesize a unique email (the unique business key) from the
      // address.
      user = await User.create({
        email: `${addr}@wallet.finne`,
        role: seatToBackendRole(desiredSeat),
        seat: desiredSeat,
        displayName: `Wallet ${addr.slice(0, 6)}…${addr.slice(-4)}`,
        platformKey: "northstar",
        walletAddress: addr,
      });
    }

    const pub = toPublic(user);
    const token = createToken({ userId: pub.id, role: pub.role, displayName: pub.displayName });
    res.json({ token, user: pub });
  } catch (e) {
    next(e);
  }
});

// POST /auth/logout — client-side only (just drop the token); here for completeness
authRoutes.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});
