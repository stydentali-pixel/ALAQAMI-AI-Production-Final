import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { getSessionUser } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";
import {
  deleteChatSession,
  getChatSession,
  updateChatSession,
  type CreateChatSessionInput,
} from "@/lib/db/chatRepo";
import { recordAudit } from "@/lib/db/auditLogRepo";

export const runtime = "nodejs";

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

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/** GET /api/chats/:sessionId — fetch one session with its full message history. */
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const { sessionId } = await params;
  const session = await getChatSession(user.id, sessionId);
  if (!session) return apiError("Chat session not found", 404);
  return apiOk({ session });
});

/** PATCH /api/chats/:sessionId — partially update a session's metadata. */
export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const tooLarge = checkBodySize(req, 64 * 1024);
  if (tooLarge) return apiError(tooLarge, 413);

  let body: Partial<CreateChatSessionInput>;
  try {
    body = (await req.json()) as Partial<CreateChatSessionInput>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const validationError = validateBody(body);
  if (validationError) return apiError(validationError, 400);

  const { sessionId } = await params;
  const session = await updateChatSession(user.id, sessionId, body);
  if (!session) return apiError("Chat session not found", 404);
  return apiOk({ session });
});

/** DELETE /api/chats/:sessionId — delete a session and all of its messages. */
export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const { sessionId } = await params;
  const removed = await deleteChatSession(user.id, sessionId);
  if (!removed) return apiError("Chat session not found", 404);
  await recordAudit({
    action: "chat.session.delete",
    userId: user.id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    metadata: { sessionId },
  });
  return apiOk({ deleted: true });
});
