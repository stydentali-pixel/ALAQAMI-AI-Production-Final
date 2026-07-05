import { NextRequest, NextResponse } from "next/server";
import { buildRequest } from "@/lib/providers/adapters";
import { PROVIDER_MAP } from "@/lib/providers/catalog";
import type { ProviderId } from "@/lib/providers/types";
import { getSessionUser } from "@/lib/security/auth";
import { resolveProviderConfig, ProviderResolutionError } from "@/lib/providers/manager";

export const runtime = "nodejs";

interface TestBody {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  mode?: "byok" | "server";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  try {
    const { providerId } = await params;
    const provider = PROVIDER_MAP[providerId as ProviderId];
    if (!provider) {
      return NextResponse.json(
        { ok: false, error: `Unknown provider: ${providerId}` },
        { status: 400 },
      );
    }

    let body: TestBody = {};
    try {
      body = (await req.json()) as TestBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const mode = body.mode || (body.apiKey ? "byok" : "server");
    const user = mode === "server" ? await getSessionUser(req) : null;

    let resolved;
    try {
      resolved = await resolveProviderConfig({
        providerId: providerId as ProviderId,
        mode,
        user,
        clientApiKey: body.apiKey,
        clientBaseUrl: body.baseUrl,
      });
    } catch (e: any) {
      if (e instanceof ProviderResolutionError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      return NextResponse.json({ ok: false, error: e.message || "Failed to resolve provider" }, { status: 500 });
    }

    const model = body.model || provider.popularModels[0]?.id;
    if (!model) {
      return NextResponse.json(
        { ok: false, error: "No model available to test this provider" },
        { status: 400 },
      );
    }

    let requestInit;
    try {
      requestInit = buildRequest({
        providerId: provider.id,
        model,
        messages: [
          {
            id: "test",
            role: "user",
            content: "Hi",
            createdAt: new Date().toISOString(),
          },
        ],
        parameters: { temperature: 0, topP: 1, maxTokens: 8 },
        stream: false,
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl,
      });
      
      if (resolved.customHeaders) {
        Object.assign(requestInit.headers, resolved.customHeaders);
      }
      if (resolved.organization) {
        requestInit.headers["OpenAI-Organization"] = resolved.organization;
      }
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message || "Failed to build provider request" },
        { status: 500 },
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const upstream = await fetch(requestInit.url, {
        method: "POST",
        headers: requestInit.headers,
        body: requestInit.body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (upstream.ok) {
        upstream.body?.cancel().catch(() => {});
        return NextResponse.json({ ok: true });
      }

      const errText = await upstream.text().catch(() => "");
      let message = errText || upstream.statusText || `Upstream returned ${upstream.status}`;
      try {
        const parsed = JSON.parse(errText);
        message =
          parsed?.error?.message ||
          parsed?.message ||
          (typeof parsed?.error === "string" ? parsed.error : message);
      } catch {
        /* keep raw text as the message */
      }

      return NextResponse.json(
        { ok: false, error: message },
        { status: upstream.status || 502 },
      );
    } catch (e: any) {
      clearTimeout(timeoutId);
      const message =
        e?.name === "AbortError"
          ? "Request timed out while contacting the provider"
          : `Network error: ${e?.message || e}`;
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected server error" },
      { status: 500 },
    );
  }
}
