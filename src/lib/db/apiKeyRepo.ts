import { createHash, randomBytes } from "node:crypto";
import type { ApiKey } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Programmatic API key repository (Supabase PostgreSQL via Prisma).
 *
 * Lets a user mint long-lived API keys for programmatic access. The raw key
 * is shown exactly once at creation time and is NEVER stored — only its
 * SHA-256 hash is persisted (`keyHash`), plus a short non-secret `prefix`
 * for display. Verification hashes the incoming key and looks up the hash.
 */

const KEY_PREFIX = "alq_";

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function toView(k: ApiKey): ApiKeyView {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    revoked: k.revoked,
    createdAt: k.createdAt.toISOString(),
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeyView[]> {
  const rows = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toView);
}

/** Creates a key and returns the RAW key exactly once (never retrievable again). */
export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ apiKey: ApiKeyView; rawKey: string }> {
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `${KEY_PREFIX}${secret}`;
  const prefix = rawKey.slice(0, 8);
  const record = await prisma.apiKey.create({
    data: { userId, name, keyHash: hashKey(rawKey), prefix },
  });
  return { apiKey: toView(record), rawKey };
}

export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const result = await prisma.apiKey.updateMany({
    where: { id, userId },
    data: { revoked: true },
  });
  return result.count > 0;
}

export async function deleteApiKey(userId: string, id: string): Promise<boolean> {
  const result = await prisma.apiKey.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

/** Verifies a raw API key, returning the owning userId, or null if invalid/revoked. */
export async function verifyApiKey(rawKey: string): Promise<{ userId: string } | null> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(rawKey) } });
  if (!record || record.revoked) return null;
  // Best-effort last-used tracking; never block auth on this write.
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { userId: record.userId };
}
