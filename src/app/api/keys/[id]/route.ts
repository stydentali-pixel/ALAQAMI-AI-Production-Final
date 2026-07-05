import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { getSessionUser } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";
import { deleteApiKey, revokeApiKey } from "@/lib/db/apiKeyRepo";
import { recordAudit } from "@/lib/db/auditLogRepo";

export const runtime = "nodejs";

function checkRate(userId: string) {
  const rl = rateLimit(`keys:${userId}`, 20, 60 * 1000);
  return rl.allowed ? null : `Too many requests. Try again in ${rl.retryAfterSeconds}s.`;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/keys/:id — revoke a key (keeps its row/history but blocks future auth). */
export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const { id } = await params;
  const revoked = await revokeApiKey(user.id, id);
  if (!revoked) return apiError("API key not found", 404);
  await recordAudit({
    action: "apikey.revoke",
    userId: user.id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    metadata: { id },
  });
  return apiOk({ revoked: true });
});

/** DELETE /api/keys/:id — permanently remove a key. */
export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const { id } = await params;
  const removed = await deleteApiKey(user.id, id);
  if (!removed) return apiError("API key not found", 404);
  await recordAudit({
    action: "apikey.delete",
    userId: user.id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    metadata: { id },
  });
  return apiOk({ deleted: true });
});
