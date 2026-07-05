import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/api/response";
import { getSessionUser } from "@/lib/security/auth";

export const runtime = "nodejs";

export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  return apiOk({ user });
});
