import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { loadEnv } from "./env.ts";
import type { Role } from "./rbac.ts";

/* ============================================================================
   Password hashing + JWT session tokens.
   Password = identity (off-chain). The wallet handles on-chain money movement.
   ========================================================================== */

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "24h";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface TokenPayload {
  userId: string;
  role: Role;
  displayName: string;
}

export function createToken(payload: TokenPayload): string {
  return jwt.sign(payload, loadEnv().sessionSecret, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, loadEnv().sessionSecret) as TokenPayload;
  } catch {
    return null;
  }
}

/** Public-safe user shape (no passwordHash). */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  seat: string | null;
  displayName: string;
  platformKey: string;
  walletAddress: string | null;
}
