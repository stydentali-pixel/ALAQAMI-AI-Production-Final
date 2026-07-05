import { apiOk } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * GET /api
 * --------
 * Health check. Replaces a leftover Next.js scaffold placeholder
 * ("Hello, world!") that had no real purpose in production. Useful as a
 * liveness probe target for the process supervisor / load balancer.
 */
export async function GET() {
  return apiOk({ status: "ok", service: "alaqami-ai" });
}
