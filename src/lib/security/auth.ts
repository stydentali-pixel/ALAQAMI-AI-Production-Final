import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { collection, pruneExpiredSessions, type UserRecord } from "@/lib/db/jsonStore";

/**
 * Auth
 * ----
 * Minimal, dependency-free email/password authentication with opaque
 * server-side sessions (not JWTs) so a session can be instantly revoked by
 * deleting its row — important since these sessions gate access to
 * decrypted provider API keys.
 *
 * Cookie carries only a random session id; all session state (user, expiry)
 * lives server-side in the database. This is intentionally the simplest
 * viable "Authenticated Backend" for the Mode 2 (server-side encrypted
 * storage) flow described in the brief. Swapping in a full-featured auth
 * provider (OAuth, magic links, 2FA) later is additive — the `getSessionUser`
 * contract below is the only thing other modules depend on.
 */

export const SESSION_COOKIE = "alaqami_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  email: string;
}

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

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  return collection("users").find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export async function createUser(email: string, password: string): Promise<UserRecord> {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error("An account with this email already exists");
  }
  const now = new Date().toISOString();
  const user: UserRecord = {
    id: randomUUID(),
    email: email.toLowerCase().trim(),
    passwordHash: createPasswordHash(password),
    createdAt: now,
    updatedAt: now,
  };
  return collection("users").insert(user);
}

// Fixed-cost dummy hash used to equalize response time when the account
// doesn't exist, so login timing can't be used to enumerate valid emails.
const DUMMY_HASH = createPasswordHash("dummy-password-for-timing-equalization");

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<UserRecord | null> {
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
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await collection("sessions").insert({
    id,
    userId,
    expiresAt,
    createdAt: new Date().toISOString(),
  });
  return { id, expiresAt };
}

export async function destroySession(sessionId: string): Promise<void> {
  await collection("sessions").remove((s) => s.id === sessionId);
}

/** Resolves the authenticated user (if any) from the session cookie on a request. */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await collection("sessions").find((s) => s.id === sessionId);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await destroySession(sessionId);
    return null;
  }

  const user = await collection("users").find((u) => u.id === session.userId);
  if (!user) return null;

  return { id: user.id, email: user.email };
}

/** Cookie options shared by login/register (set) and logout (clear). */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  path: "/",
};
