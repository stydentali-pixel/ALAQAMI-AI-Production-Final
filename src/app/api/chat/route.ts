import { NextRequest, NextResponse } from "next/server";
import {
  buildRequest,
  parseChunk,
  type ChatCompletionRequest,
} from "@/lib/providers/adapters";
import { PROVIDER_MAP } from "@/lib/providers/catalog";
import type { ProviderId } from "@/lib/providers/types";
import { checkBodySize } from "@/lib/api/guard";
import { getSessionUser } from "@/lib/security/auth";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";
import {
  ProviderResolutionError,
  resolveProviderConfig,
  type ProviderMode,
} from "@/lib/providers/manager";
import { recordUsage } from "@/lib/db/usageStatsRepo";

// NOTE: this route now runs on the Node.js runtime rather than "edge".
// Mode 2 (server-side encrypted provider storage) needs `node:crypto` to
// decrypt stored API keys and reads from the on-disk database — neither of
// which the edge runtime supports. BYOK requests (mode "byok", the default,
// unchanged from before) still work exactly as they did previously; only
// requests that opt into server-side storage take the extra DB round trip.
export const runtime = "nodejs";

const UPSTREAM_TIMEOUT_MS = 30_000; // time allowed to receive the *first* byte
const MAX_RETRIES = 2; // only retried before any bytes have reached the client
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

interface ChatRequestBody extends ChatCompletionRequest {
  /** "byok" (default, unchanged) or "server" (use encrypted server-side config). */
  mode?: ProviderMode;
}

function structuredError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /api/chat
 * --------------
 * Unified streaming chat-completion endpoint. The client sends a canonical
 * `ChatCompletionRequest` (optionally with `mode: "server"` to use a stored,
 * encrypted provider configuration instead of a client-supplied key). The
 * server:
 *   1. Resolves credentials via the Unified Provider Manager (BYOK or
 *      server-stored, decrypted just-in-time).
 *   2. Builds the provider-native request.
 *   3. Fetches upstream with a timeout and a small number of retries for
 *      transient failures (before any bytes have been sent to the client).
 *   4. Streams normalized text deltas back as SSE: `data: { "text": "..." }`.
 *
 * On error, emits a final `data: { "error": "..." }` event (if streaming has
 * already started) or a structured JSON error response otherwise.
 */
export async function POST(req: NextRequest) {
  // 30 requests/minute per IP. This mainly protects the shared server-side
  // fallback provider keys (e.g. AI_GATEWAY_API_KEY) from being run up by
  // anonymous BYOK-mode traffic with no key of its own, and bounds general
  // resource usage (upstream connections, retries) per client.
  const rl = rateLimit(`chat:${getClientIp(req)}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return structuredError(
      `Too many requests. Try again in ${rl.retryAfterSeconds}s.`,
      429,
    );
  }

  // Generous cap (base64 image attachments legitimately push this up) —
  // just enough to stop unbounded-payload abuse before we touch the body.
  const tooLarge = checkBodySize(req, 25 * 1024 * 1024);
  if (tooLarge) return structuredError(tooLarge, 413);

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return structuredError("Invalid JSON body", 400);
  }

  const { providerId, model, mode = "byok" } = body;
  const provider = PROVIDER_MAP[providerId as ProviderId];
  if (!provider) {
    return structuredError(`Unknown provider: ${providerId}`, 400);
  }
  if (!model) {
    return structuredError("Model is required", 400);
  }

  // Resolve credentials via the Unified Provider Manager. Only look up the
  // session when server-side mode is actually requested — BYOK requests
  // (the default, and all pre-existing traffic) never touch auth or the DB.
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
  } catch (e) {
    if (e instanceof ProviderResolutionError) {
      return structuredError(e.message, e.status);
    }
    return structuredError("Failed to resolve provider configuration", 500);
  }

  // Strip the extra `mode` field before handing off to buildRequest, which
  // expects the canonical ChatCompletionRequest shape exactly.
  const { mode: _mode, ...chatCompletionBody } = body;

  let requestInit;
  try {
    requestInit = buildRequest({
      ...chatCompletionBody,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
    });
    // Merge any server-stored custom headers / organization override. These
    // only apply in server mode (BYOK never has these fields populated).
    if (resolved.customHeaders) {
      Object.assign(requestInit.headers, resolved.customHeaders);
    }
    if (resolved.organization) {
      requestInit.headers["OpenAI-Organization"] = resolved.organization;
    }
  } catch (e: any) {
    return structuredError(e?.message || "Failed to build provider request", 500);
  }

  // Fetch upstream with a timeout + a small number of retries for transient
  // failures. Retries only happen here, before any byte has reached the
  // client — once we start streaming, we commit to that single attempt.
  let upstream: Response | undefined;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      // NOTE: `requestInit.body` is always a plain JSON string (never a
      // ReadableStream), so the `duplex: "half"` option is unnecessary here.
      // Some edge runtimes (notably Vercel Edge Functions on certain hosts)
      // reject or crash on unrecognized fetch init properties like `duplex`
      // when the body isn't a stream — that crash happens *before* our
      // try/catch can produce a JSON error, and surfaces to the client as a
      // bare "502 Bad Gateway" / "Unexpected token '<'" from the platform
      // itself rather than from this route. Omitting it avoids that failure
      // mode entirely; it is only ever needed for streaming request bodies.
      const response = await fetch(requestInit.url, {
        method: "POST",
        headers: requestInit.headers,
        body: requestInit.body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        upstream = response;
        break;
      }

      if (!RETRIABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
        upstream = response; // fall through to normal error handling below
        break;
      }

      // Retriable — release the body and back off before trying again.
      response.body?.cancel().catch(() => {});
      lastError = `Upstream returned ${response.status}`;
      await sleep(300 * Math.pow(2, attempt)); // 300ms, 600ms
    } catch (e: any) {
      clearTimeout(timeoutId);
      const isAbort = e?.name === "AbortError";
      lastError = isAbort
        ? "Request timed out while contacting the provider"
        : `Network error: ${e?.message || e}`;

      if (attempt === MAX_RETRIES) {
        return structuredError(lastError, isAbort ? 504 : 502);
      }
      await sleep(300 * Math.pow(2, attempt));
    }
  }

  if (!upstream) {
    return structuredError(lastError || "Failed to reach provider", 502);
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    let message = errText || upstream.statusText;
    try {
      const j = JSON.parse(errText);
      if (j?.error?.message) message = j.error.message;
      else if (j?.message) message = j.message;
      else if (j?.error) message = typeof j.error === "string" ? j.error : message;
    } catch {
      /* keep raw */
    }
    return structuredError(message || `Upstream ${upstream.status}`, upstream.status === 429 ? 429 : upstream.status);
  }

  // Stream normalized SSE back to the client.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream!.body!.getReader();
      let buffer = "";

      // Accumulate token usage across the stream so we can persist a single
      // aggregated usage record when the response completes (server mode only).
      let promptTokens = 0;
      let completionTokens = 0;

      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      const accumulateUsage = (usage: {
        promptTokens?: number;
        completionTokens?: number;
      }) => {
        if (typeof usage.promptTokens === "number") promptTokens = usage.promptTokens;
        if (typeof usage.completionTokens === "number") {
          completionTokens = usage.completionTokens;
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Gemini uses pure SSE (data: lines). Anthropic uses event: + data:.
          // OpenAI uses data: lines. Cohere uses data: lines.
          // We split on \n\n (event boundary) for robustness.
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            const dataLines = rawEvent
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim());

            for (const dataLine of dataLines) {
              if (!dataLine || dataLine === "[DONE]") continue;
              try {
                const json = JSON.parse(dataLine);
                const parsed = parseChunk(requestInit.protocol, json);
                if (parsed.error) {
                  send({ error: parsed.error });
                }
                if (parsed.text) {
                  send({ text: parsed.text });
                }
                if (parsed.usage) {
                  accumulateUsage(parsed.usage);
                  send({ usage: parsed.usage });
                }
                if (parsed.done) {
                  send({ done: true });
                }
              } catch {
                // Ignore malformed lines (often partial across chunks)
              }
            }
          }
        }
        // Flush final buffer
        if (buffer.trim()) {
          const dataLines = buffer
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim());
          for (const dataLine of dataLines) {
            if (!dataLine || dataLine === "[DONE]") continue;
            try {
              const json = JSON.parse(dataLine);
              const parsed = parseChunk(requestInit.protocol, json);
              if (parsed.text) send({ text: parsed.text });
              if (parsed.done) send({ done: true });
              if (parsed.usage) {
                accumulateUsage(parsed.usage);
                send({ usage: parsed.usage });
              }
            } catch {
              /* ignore */
            }
          }
        }
        send({ done: true });
      } catch (e: any) {
        send({ error: e?.message || "Stream interrupted" });
      } finally {
        controller.close();
        // Persist aggregated usage for authenticated, server-mode requests.
        // Best-effort: never affects the streamed response to the client.
        if (user && (promptTokens > 0 || completionTokens > 0)) {
          void recordUsage({
            userId: user.id,
            provider: providerId,
            model,
            promptTokens,
            completionTokens,
          });
        }
      }
    },
    cancel() {
      // Client aborted — nothing to do, upstream will close.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
