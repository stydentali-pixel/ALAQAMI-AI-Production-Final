import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { getSessionUser } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";
import { createApiKey, listApiKeys } from "@/lib/db/apiKeyRepo";
import { recordAudit } from "@/lib/db/auditLogRepo";

export const runtime = "nodejs";

/**
 * Programmatic API keys.
 *
 * Lets an authenticated user mint keys for scripted/API access to their own
 * account. The raw key is returned exactly once, on creation — it is never
 * retrievable again (only its SHA-256 hash is persisted, see
 * `src/lib/db/apiKeyRepo.ts`).
 */

function checkRate(userId: string) {
  // Deliberately tighter than most routes — key creation is rare and a low
  // limit further discourages automated key-farming even by a legit account.
  const rl = rateLimit(`keys:${userId}`, 20, 60 * 1000);
  return rl.allowed ? null : `Too many requests. Try again in ${rl.retryAfterSeconds}s.`;
}

interface CreateKeyBody {
  name?: string;
}

/** GET /api/keys — list the current user's API keys (metadata only, never raw keys). */
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const keys = await listApiKeys(user.id);
  return apiOk({ keys });
});

/** POST /api/keys — mint a new API key. Returns the raw key once. */
export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const tooLarge = checkBodySize(req, 4 * 1024);
  if (tooLarge) return apiError(tooLarge, 413);

  let body: CreateKeyBody;
  try {
    body = (await req.json()) as CreateKeyBody;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const name = (body.name || "").trim();
  if (!name) return apiError("name is required", 400);
  if (name.length > 100) return apiError("name must be 100 characters or fewer", 400);

  const { apiKey, rawKey } = await createApiKey(user.id, name);
  await recordAudit({
    action: "apikey.create",
    userId: user.id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    metadata: { id: apiKey.id, name: apiKey.name },
  });
  // rawKey is returned exactly once and is never stored — the client must
  // display/copy it immediately; it cannot be recovered later.
  return apiOk({ apiKey, rawKey }, 201);
});
