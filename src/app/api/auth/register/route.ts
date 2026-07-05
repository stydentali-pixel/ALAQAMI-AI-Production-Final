import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { createSession, createUser, sessionCookieOptions, SESSION_COOKIE } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";

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

  const user = await createUser(body.email!.trim(), body.password!);
  const session = await createSession(user.id);

  const res = apiOk({ id: user.id, email: user.email }, 201);
  res.cookies.set(SESSION_COOKIE, session.id, {
    ...sessionCookieOptions,
    expires: new Date(session.expiresAt),
  });
  return res;
});
