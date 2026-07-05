import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/api/response";
import { destroySession, getSessionUser, SESSION_COOKIE } from "@/lib/security/auth";
import { getClientIp } from "@/lib/security/rateLimit";
import { recordAudit } from "@/lib/db/auditLogRepo";

export const runtime = "nodejs";

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const user = await getSessionUser(req);
    await destroySession(sessionId);
    await recordAudit({
      action: "auth.logout",
      userId: user?.id ?? null,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  }
  const res = apiOk({ loggedOut: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
