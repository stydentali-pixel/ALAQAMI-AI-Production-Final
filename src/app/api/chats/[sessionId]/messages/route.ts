import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { getSessionUser } from "@/lib/security/auth";
import { rateLimit } from "@/lib/security/rateLimit";
import { appendMessage, type AppendMessageInput } from "@/lib/db/chatRepo";

export const runtime = "nodejs";

function checkRate(userId: string) {
  // Messages are appended far more often than sessions are created/edited.
  const rl = rateLimit(`chats:messages:${userId}`, 300, 60 * 1000);
  return rl.allowed ? null : `Too many requests. Try again in ${rl.retryAfterSeconds}s.`;
}

function validateBody(body: Partial<AppendMessageInput>): string | null {
  if (!body.role || typeof body.role !== "string") return "role is required";
  if (!["system", "user", "assistant"].includes(body.role)) {
    return 'role must be one of "system", "user", "assistant"';
  }
  if (typeof body.content !== "string") return "content must be a string";
  return null;
}

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/** POST /api/chats/:sessionId/messages — append a message to an owned session. */
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const tooLarge = checkBodySize(req, 512 * 1024);
  if (tooLarge) return apiError(tooLarge, 413);

  let body: Partial<AppendMessageInput>;
  try {
    body = (await req.json()) as Partial<AppendMessageInput>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const validationError = validateBody(body);
  if (validationError) return apiError(validationError, 400);

  const { sessionId } = await params;
  const message = await appendMessage(user.id, sessionId, body as AppendMessageInput);
  if (!message) return apiError("Chat session not found", 404);
  return apiOk({ message }, 201);
});
