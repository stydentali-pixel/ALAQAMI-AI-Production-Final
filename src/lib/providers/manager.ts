import type { SessionUser } from "@/lib/security/auth";
import { getDecryptedProviderConfig } from "@/lib/db/providerConfigRepo";
import { PROVIDER_MAP } from "./catalog";
import type { ProviderId } from "./types";

/**
 * Unified Provider Manager
 * ------------------------
 * A single place that decides, for a given chat/test request, where the
 * provider credentials come from:
 *
 *  - Mode 1 (BYOK):   the key travels with the request (client → server on
 *                      every call) and is never persisted server-side. This
 *                      is the original/default behavior and requires no
 *                      authentication.
 *  - Mode 2 (server):  the key was previously stored encrypted via the
 *                      Settings API, tied to an authenticated user, and is
 *                      decrypted here, in-memory, for the duration of this
 *                      one request only.
 *
 * The rest of the app (chat route, provider-test route) only talks to this
 * module — it never touches the encryption or storage layers directly.
 */

export type ProviderMode = "byok" | "server";

export interface ResolveProviderInput {
  providerId: ProviderId;
  mode?: ProviderMode;
  /** Session user — required (and enforced) when mode === "server". */
  user: SessionUser | null;
  /** Client-supplied values — used when mode === "byok" (the default). */
  clientApiKey?: string;
  clientBaseUrl?: string;
}

export interface ResolvedProviderConfig {
  apiKey: string;
  baseUrl?: string;
  customHeaders?: Record<string, string> | null;
  organization?: string | null;
  mode: ProviderMode;
}

export class ProviderResolutionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function resolveProviderConfig(
  input: ResolveProviderInput,
): Promise<ResolvedProviderConfig> {
  const provider = PROVIDER_MAP[input.providerId];
  if (!provider) {
    throw new ProviderResolutionError(`Unknown provider: ${input.providerId}`, 400);
  }

  const mode: ProviderMode = input.mode ?? "byok";

  if (mode === "server") {
    if (!input.user) {
      throw new ProviderResolutionError(
        "Authentication required for server-side provider storage",
        401,
      );
    }
    const stored = await getDecryptedProviderConfig(input.user.id, input.providerId);
    if (!stored) {
      throw new ProviderResolutionError(
        `No enabled server-side configuration found for provider "${input.providerId}". ` +
          "Add one in Settings, or switch this request to BYOK mode.",
        404,
      );
    }
    return {
      apiKey: stored.apiKey,
      baseUrl: stored.baseURL ?? undefined,
      customHeaders: stored.customHeaders,
      organization: stored.organization,
      mode,
    };
  }

  // BYOK: client-supplied key, falling back to the provider's server env var
  // (unchanged from the original behavior — e.g. Vercel AI Gateway working
  // out of the box).
  const envKey = provider.serverEnvKey ? process.env[provider.serverEnvKey] : undefined;
  const apiKey = input.clientApiKey || envKey || "";

  if (!apiKey && input.providerId !== "openai-compatible") {
    throw new ProviderResolutionError("No API key. Add one in Settings.", 401);
  }

  return {
    apiKey,
    baseUrl: input.clientBaseUrl,
    mode,
  };
}
