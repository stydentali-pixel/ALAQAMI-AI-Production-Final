import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api/response";
import { checkBodySize } from "@/lib/api/guard";
import { getSessionUser } from "@/lib/security/auth";
import {
  deleteProviderConfig,
  getProviderConfig,
  listProviderConfigs,
  patchProviderConfig,
  upsertProviderConfig,
  type ProviderConfigInput,
} from "@/lib/db/providerConfigRepo";
import { isValidProviderId } from "@/lib/providers/catalog";
import { rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

/**
 * Settings API — Mode 2 (server-side encrypted provider storage).
 *
 * All routes require an authenticated session (see `/api/auth/*`). API keys
 * are encrypted before being written to the database and are never returned
 * to the client — only a masked preview (`apiKeyMasked`) and a boolean
 * (`hasApiKey`) are exposed.
 */

// Rate limited per-user (not per-IP) since every route here already requires
// a session — 60 requests/minute is generous for real UI usage while still
// bounding how hard one account can hammer the encrypt/decrypt + disk I/O path.
function checkRate(userId: string) {
  const rl = rateLimit(`settings:${userId}`, 60, 60 * 1000);
  return rl.allowed
    ? null
    : `Too many requests. Try again in ${rl.retryAfterSeconds}s.`;
}

function validateBody(body: Partial<ProviderConfigInput>): string | null {
  if (body.provider !== undefined && !isValidProviderId(body.provider)) {
    return `Unknown provider: ${body.provider}`;
  }
  if (body.apiKey !== undefined && typeof body.apiKey !== "string") {
    return "apiKey must be a string";
  }
  if (body.customHeaders !== undefined && body.customHeaders !== null) {
    if (typeof body.customHeaders !== "object" || Array.isArray(body.customHeaders)) {
      return "customHeaders must be an object of string key/value pairs";
    }
    for (const [k, v] of Object.entries(body.customHeaders)) {
      if (typeof v !== "string") return `customHeaders.${k} must be a string`;
    }
  }
  return null;
}

/** GET /api/settings — list all provider configs for the current user, or one via ?provider=. */
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const providerParam = req.nextUrl.searchParams.get("provider");
  if (providerParam) {
    if (!isValidProviderId(providerParam)) {
      return apiError(`Unknown provider: ${providerParam}`, 400);
    }
    const config = await getProviderConfig(user.id, providerParam);
    return apiOk({ config: config ?? null });
  }

  const configs = await listProviderConfigs(user.id);
  return apiOk({ configs });
});

/** POST /api/settings — create or fully replace the config for a provider. */
export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const tooLarge = checkBodySize(req, 32 * 1024);
  if (tooLarge) return apiError(tooLarge, 413);

  let body: Partial<ProviderConfigInput>;
  try {
    body = (await req.json()) as Partial<ProviderConfigInput>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.provider) return apiError("provider is required", 400);
  const validationError = validateBody(body);
  if (validationError) return apiError(validationError, 400);

  const config = await upsertProviderConfig(user.id, body as ProviderConfigInput);
  return apiOk({ config }, 201);
});

/** PATCH /api/settings — partial update, addressed by config id. */
export const PATCH = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const tooLarge = checkBodySize(req, 32 * 1024);
  if (tooLarge) return apiError(tooLarge, 413);

  let body: Partial<ProviderConfigInput> & { id?: string };
  try {
    body = (await req.json()) as Partial<ProviderConfigInput> & { id?: string };
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.id) return apiError("id is required", 400);
  const validationError = validateBody(body);
  if (validationError) return apiError(validationError, 400);

  const { id, ...patch } = body;
  const config = await patchProviderConfig(user.id, id, patch);
  if (!config) return apiError("Provider config not found", 404);
  return apiOk({ config });
});

/** DELETE /api/settings?id=... — remove a stored provider config. */
export const DELETE = withApiErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return apiError("Authentication required", 401);
  const rateError = checkRate(user.id);
  if (rateError) return apiError(rateError, 429);

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return apiError("id query parameter is required", 400);

  const removed = await deleteProviderConfig(user.id, id);
  if (!removed) return apiError("Provider config not found", 404);
  return apiOk({ deleted: true });
});
