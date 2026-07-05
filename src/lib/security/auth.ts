import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Auth
 * ----
 * Minimal, dependency-free email/password authentication with opaque
 * server-side sessions (not JWTs) so a session can be instantly revoked by
 * deleting its row — important since these sessions gate access to
 * decrypted provider API keys.
 *
 * Cookie carries only a random session id; all session state (user, expiry)
 * lives server-side in the database (Supabase PostgreSQL via Prisma). This is
 * intentionally the simplest viable "Authenticated Backend" for the Mode 2
 * (server-side encrypted storage) flow described in the brief. Swapping in a
 * full-featured auth provider (OAuth, magic links, 2FA) later is additive —
 * the `getSessionUser` contract below is the only thing other modules depend
 * on.
 */

export const SESSION_COOKIE = "alaqami_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  email: string;
}

/** Re-exported for callers that previously depended on the JSON store's record shape. */
export type UserRecord = User;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function createPasswordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  return `${salt}:${hash}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
}

export async function createUser(email: string, password: string): Promise<User> {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error("An account with this email already exists");
  }
  return prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: createPasswordHash(password),
    },
  });
}

// Fixed-cost dummy hash used to equalize response time when the account
// doesn't exist, so login timing can't be used to enumerate valid emails.
const DUMMY_HASH = createPasswordHash("dummy-password-for-timing-equalization");

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    verifyPasswordHash(password, DUMMY_HASH); // burn equivalent CPU time, then fail
    return null;
  }
  if (!verifyPasswordHash(password, user.passwordHash)) return null;
  return user;
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: string }> {
  await pruneExpiredSessions();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({
    data: { userId, expiresAt },
  });
  return { id: session.id, expiresAt: session.expiresAt.toISOString() };
}

export async function destroySession(sessionId: string): Promise<void> {
  // deleteMany never throws on a missing row (unlike delete), so logout is
  // idempotent even if the session was already pruned/expired.
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Removes expired sessions. Safe to call opportunistically on login/session checks. */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

/** Resolves the authenticated user (if any) from the session cookie on a request. */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await destroySession(sessionId);
    return null;
  }

  return { id: session.user.id, email: session.user.email };
}

/** Cookie options shared by login/register (set) and logout (clear). */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
