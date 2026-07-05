import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { createSession, sessionCookieOptions, SESSION_COOKIE, verifyCredentials } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

interface LoginBody {
  email?: string;
  password?: string;
}

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  // 10 attempts per 15 minutes per IP — mitigates credential-stuffing/brute force.
  const rl = rateLimit(`login:${getClientIp(req)}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return apiError(
      `Too many login attempts. Try again in ${rl.retryAfterSeconds}s.`,
      429,
    );
  }

  let body: LoginBody;
  try {
    const tooLarge = checkBodySize(req, 8 * 1024);
    if (tooLarge) return apiError(tooLarge, 413);
    body = (await req.json()) as LoginBody;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.email || !body.password) {
    return apiError("Email and password are required", 400);
  }

  const user = await verifyCredentials(body.email, body.password);
  if (!user) {
    // Deliberately generic — never reveal whether the email exists.
    return apiError("Invalid email or password", 401);
  }

  const session = await createSession(user.id);
  const res = apiOk({ id: user.id, email: user.email });
  res.cookies.set(SESSION_COOKIE, session.id, {
    ...sessionCookieOptions,
    expires: new Date(session.expiresAt),
  });
  return res;
});
