import type { NextRequest } from "next/server";

/**
 * Rate limiting
 * -------------
 * A minimal in-memory, fixed-window rate limiter. Good enough for a single
 * long-running process (this app's actual deployment shape — see
 * `.zscripts/start.sh`). It intentionally has no external dependency.
 *
 * NOTE: if this app is ever scaled horizontally (multiple instances behind
 * a load balancer), this in-memory counter won't be shared across
 * instances — swap it for a shared store (e.g. Redis) at that point. This
 * is called out in the technical-debt notes.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically drop old buckets so this map can't grow unbounded.
// (Typed as `unknown` + a runtime guard for `.unref` because this project's
// tsconfig includes the "dom" lib alongside Node globals, which makes the
// return type of `setInterval` ambiguous across environments.)
const cleanupTimer: unknown = setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  },
  10 * 60 * 1000,
);
if (
  cleanupTimer &&
  typeof cleanupTimer === "object" &&
  "unref" in cleanupTimer &&
  typeof (cleanupTimer as { unref: unknown }).unref === "function"
) {
  (cleanupTimer as { unref: () => void }).unref();
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Returns { allowed: false } once `limit` requests have been made for `key`
 * within the current `windowMs` window; otherwise increments and allows.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}
