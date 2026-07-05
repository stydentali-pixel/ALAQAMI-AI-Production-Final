import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Audit log repository (Supabase PostgreSQL via Prisma).
 *
 * Records security-relevant events (login, logout, registration, provider
 * config changes, etc.). Writes are best-effort: an audit failure must never
 * break the user-facing request, so `recordAudit` swallows and logs its own
 * errors rather than propagating them.
 *
 * Secure logging: callers should pass only non-sensitive metadata here. Never
 * log plaintext passwords, API keys, or full tokens.
 */

export interface AuditEventInput {
  action: string;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAudit(event: AuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: event.action,
        userId: event.userId ?? null,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
        metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Never let audit logging take down the request it is observing.
    console.error("[audit] failed to record event:", (err as Error)?.message);
  }
}

export interface AuditLogView {
  id: string;
  action: string;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export async function listAuditLogs(userId: string, limit = 100): Promise<AuditLogView[]> {
  const rows = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    ip: r.ip,
    userAgent: r.userAgent,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
