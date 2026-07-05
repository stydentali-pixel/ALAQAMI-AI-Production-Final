import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { getSessionUser } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";
import {
  getUserPreferences,
  upsertUserPreferences,
  type UserPreferencesInput,
} from "@/lib/db/userPreferencesRepo";
import { isValidProviderId } from "@/lib/providers/catalog";
import { recordAudit } from "@/lib/db/auditLogRepo";

export const runtime = "nodejs";

/**
 * Server-side user preferences (optional sync).
 *
 * Mirrors the language/theme/default-provider settings the client keeps in
 * localStorage today, so an authenticated user's preferences can follow them
 * across devices/browsers. Purely additive — the client UI continues to read
 * its local copy first and may call this endpoint to sync in the background.
 */

function checkRate(userId: string) {
  const rl = rateLimit(`preferences:${userId}`, 60, 60 * 1000);
  return rl.allowed ? null : `Too many requests. Try again in ${rl.retryAfterSeconds}s.`;
}

const VALID_THEMES = new Set(["system", "light", "dark"]);

function validateBody(body: Partial<UserPreferencesInput>): string | null {
  if (body.language !== undefined && typeof body.language !== "string") {
    return "language must be a string";
  }
  if (body.theme !== undefined && !VALID_THEMES.has(body.theme)) {
    return `theme must be one of: ${[...VALID_THEMES].join(", ")}`;
  }
  if (body.defaultProvider !== undefined && body.defaultProvider !== null) {
    if (!isValidProviderId(body.defaultProvider)) {
      return `Unknown provider: ${body.defaultProvider}`;
    }
  }
  if (body.fallbackProvider !== undefined && body.fallbackProvider !== null) {
    if (!isValidProviderId(body.fallbackProvider)) {
      return `Unknown provider: ${body.fallbackProvider}`;
    }
  }
  if (body.defaultParameters !== undefined && body.defaultParameters !== null) {
    if (typeof body.defaultParameters !== "object" || Array.isArray(body.defaultParameters)) {
      return "defaultParameters must be an object";
    }
  }
  return null;
}

/** GET /api/preferences — fetch the current user's stored preferences (or null). */
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const preferences = await getUserPreferences(user.id);
  return apiOk({ preferences });
});

/** PUT /api/preferences — create or update the current user's preferences. */
export const PUT = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const tooLarge = checkBodySize(req, 16 * 1024);
  if (tooLarge) return apiError(tooLarge, 413);

  let body: Partial<UserPreferencesInput>;
  try {
    body = (await req.json()) as Partial<UserPreferencesInput>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const validationError = validateBody(body);
  if (validationError) return apiError(validationError, 400);

  const preferences = await upsertUserPreferences(user.id, body);
  await recordAudit({
    action: "preferences.upsert",
    userId: user.id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  return apiOk({ preferences });
});
