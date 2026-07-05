import { NextResponse } from "next/server";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import type { ProviderId } from "@/lib/providers/types";

export const runtime = "edge";

/**
 * GET /api/providers/status
 * -------------------------
 * Reports which providers have a server-side API key configured (via their
 * `serverEnvKey` environment variable). The client uses this to enable those
 * providers automatically — e.g. the Vercel AI Gateway works out of the box
 * with no user-supplied key. Only booleans are returned; keys never leave the
 * server.
 */
export async function GET() {
  const serverKeys: Partial<Record<ProviderId, boolean>> = {};
  for (const provider of PROVIDER_CATALOG) {
    if (provider.serverEnvKey) {
      const value = process.env[provider.serverEnvKey];
      serverKeys[provider.id] = !!(value && value.trim());
    }
  }
  return NextResponse.json({ ok: true, serverKeys });
}
