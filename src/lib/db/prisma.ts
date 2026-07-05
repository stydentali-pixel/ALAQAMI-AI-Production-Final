import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client singleton
 * -----------------------
 * A single shared PrismaClient instance for the whole app. In development the
 * Next.js dev server hot-reloads modules frequently; without caching the
 * client on `globalThis` we would leak a new connection pool on every reload
 * and eventually exhaust Postgres connections. In production a single instance
 * is created per server/lambda.
 *
 * Connection strings come from the environment (see `prisma/schema.prisma`):
 *   - DATABASE_URL : pooled connection (Supavisor / PgBouncer) used at runtime
 *   - DIRECT_URL   : direct/session connection used by migrations
 *
 * This module is server-only — it must never be imported into client
 * components. Every consumer lives under `src/lib/db/*` or in route handlers
 * that declare `export const runtime = "nodejs"`.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
