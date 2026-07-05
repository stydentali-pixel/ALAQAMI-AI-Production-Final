import { NextRequest, NextResponse } from "next/server";
import { PROVIDER_MAP } from "@/lib/providers/catalog";
import type { ProviderId } from "@/lib/providers/types";

export const runtime = "edge";

/**
 * GET /api/providers/[providerId]/models
 * Returns the list of known models for this provider. For OpenAI-compatible
 * providers, attempts to call the upstream /models endpoint to enumerate
 * available models.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await params;
  const provider = PROVIDER_MAP[providerId as ProviderId];
  if (!provider) {
    return NextResponse.json(
      { ok: false, error: "Unknown provider" },
      { status: 400 },
    );
  }

  // NOTE: this only ever uses the server-side env fallback key, never a
  // client-supplied one. API keys must never travel in a URL query string
  // (they end up in access logs, proxy logs, and browser history) — the
  // frontend has never actually sent one here, so this simply removes an
  // unused, insecure code path rather than changing any real behavior.
  const apiKey = provider.serverEnvKey ? process.env[provider.serverEnvKey] || "" : "";
  const baseUrlOverride = req.nextUrl.searchParams.get("baseUrl");
  const baseUrl = (baseUrlOverride || provider.baseUrl).replace(/\/$/, "");

  // Try to fetch upstream /models for OpenAI-compatible protocols
  if (
    provider.protocol === "openai-chat" ||
    provider.protocol === "openrouter"
  ) {
    try {
      const upstream = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (upstream.ok) {
        const data = await upstream.json();
        const upstreamModels = (data?.data || data?.models || [])
          .map((m: any) => ({
            id: m.id || m.name,
            name: m.id || m.name,
            label: m.id || m.name,
            provider: provider.id,
          }))
          .filter((m: any) => m.id);
        if (upstreamModels.length > 0) {
          return NextResponse.json({
            ok: true,
            models: [...provider.popularModels, ...upstreamModels].filter(
              (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
            ),
          });
        }
      }
    } catch {
      /* fall through to defaults */
    }
  }

  return NextResponse.json({ ok: true, models: provider.popularModels });
}
