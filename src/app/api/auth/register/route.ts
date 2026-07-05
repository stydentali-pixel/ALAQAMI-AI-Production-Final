import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { createSession, createUser, sessionCookieOptions, SESSION_COOKIE } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";
import { recordAudit } from "@/lib/db/auditLogRepo";

export const runtime = "nodejs";

interface RegisterBody {
  email?: string;
  password?: string;
}

function validate(body: RegisterBody): string | null {
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return "A valid email is required";
  }
  if (!body.password || body.password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  // 5 registrations per hour per IP — mitigates automated account creation.
  const rl = rateLimit(`register:${getClientIp(req)}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return apiError(
      `Too many registration attempts. Try again in ${rl.retryAfterSeconds}s.`,
      429,
    );
  }

  let body: RegisterBody;
  try {
    const tooLarge = checkBodySize(req, 8 * 1024);
    if (tooLarge) return apiError(tooLarge, 413);
    body = (await req.json()) as RegisterBody;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const validationError = validate(body);
  if (validationError) return apiError(validationError, 400);

  let user;
  try {
    user = await createUser(body.email!.trim(), body.password!);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "";
    // Duplicate email (pre-check or DB unique-constraint race, Prisma P2002).
    if (message.includes("already exists") || (e as { code?: string })?.code === "P2002") {
      return apiError("An account with this email already exists", 409);
    }
    throw e;
  }
  const session = await createSession(user.id);
  await recordAudit({
    action: "auth.register",
    userId: user.id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  const res = apiOk({ id: user.id, email: user.email }, 201);
  res.cookies.set(SESSION_COOKIE, session.id, {
    ...sessionCookieOptions,
    expires: new Date(session.expiresAt),
  });
  return res;
});
