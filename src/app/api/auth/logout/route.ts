import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/api/response";
import { destroySession, SESSION_COOKIE } from "@/lib/security/auth";

export const runtime = "nodejs";

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await destroySession(sessionId);
  }
  const res = apiOk({ loggedOut: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
