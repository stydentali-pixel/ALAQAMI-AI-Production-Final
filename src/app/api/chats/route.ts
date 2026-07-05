import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { getSessionUser } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";
import {
  createChatSession,
  listChatSessions,
  type CreateChatSessionInput,
} from "@/lib/db/chatRepo";
import { recordAudit } from "@/lib/db/auditLogRepo";

export const runtime = "nodejs";

/**
 * Server-side chat sync API (optional).
 *
 * The primary chat store remains client-side (localStorage, see
 * `src/lib/store/index.ts`) so BYOK/anonymous usage keeps working exactly as
 * before. For authenticated users who opt in to server-side persistence
 * (e.g. to sync history across devices), these routes read/write the same
 * Prisma-backed tables the rest of Mode 2 uses. Every query is scoped to the
 * signed-in user; there is no cross-user access.
 */

function checkRate(userId: string) {
  const rl = rateLimit(`chats:${userId}`, 120, 60 * 1000);
  return rl.allowed ? null : `Too many requests. Try again in ${rl.retryAfterSeconds}s.`;
}

function validateBody(body: Partial<CreateChatSessionInput>): string | null {
  if (body.title !== undefined && typeof body.title !== "string") {
    return "title must be a string";
  }
  if (body.parameters !== undefined && body.parameters !== null) {
    if (typeof body.parameters !== "object" || Array.isArray(body.parameters)) {
      return "parameters must be an object";
    }
  }
  return null;
}

/** GET /api/chats — list all chat sessions (without messages) for the current user. */
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const sessions = await listChatSessions(user.id);
  return apiOk({ sessions });
});

/** POST /api/chats — create a new chat session for the current user. */
export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const tooLarge = checkBodySize(req, 64 * 1024);
  if (tooLarge) return apiError(tooLarge, 413);

  let body: Partial<CreateChatSessionInput> = {};
  const raw = await req.text();
  if (raw) {
    try {
      body = JSON.parse(raw) as Partial<CreateChatSessionInput>;
    } catch {
      return apiError("Invalid JSON body", 400);
    }
  }

  const validationError = validateBody(body);
  if (validationError) return apiError(validationError, 400);

  const session = await createChatSession(user.id, body);
  await recordAudit({
    action: "chat.session.create",
    userId: user.id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    metadata: { sessionId: session.id },
  });
  return apiOk({ session }, 201);
});
