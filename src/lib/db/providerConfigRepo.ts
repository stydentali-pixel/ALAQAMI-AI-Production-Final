import type { ProviderConfig } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret, maskApiKey } from "@/lib/security/encryption";

/**
 * Provider configuration repository (Supabase PostgreSQL via Prisma).
 *
 * Persists per-user provider settings. API keys are stored as AES-256-GCM
 * ciphertext (`apiKeyEncrypted`) and are NEVER returned to the client — the
 * public `ProviderConfigView` only exposes a boolean (`hasApiKey`) and a
 * masked preview (`apiKeyMasked`). Only `getDecryptedProviderConfig` (a
 * server-only accessor) ever returns the plaintext key, and only for use
 * within a single request.
 */

/** Shape returned to the frontend — the API key is masked, never decrypted. */
export interface ProviderConfigView {
  id: string;
  provider: string;
  baseURL: string | null;
  enabled: boolean;
  defaultModel: string | null;
  customHeaders: Record<string, string> | null;
  organization: string | null;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConfigInput {
  provider: string;
  apiKey?: string;
  baseURL?: string | null;
  enabled?: boolean;
  defaultModel?: string | null;
  customHeaders?: Record<string, string> | null;
  organization?: string | null;
}

function normalizeHeaders(value: ProviderConfig["customHeaders"]): Record<string, string> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  return null;
}

function toView(record: ProviderConfig): ProviderConfigView {
  let masked: string | null = null;
  if (record.apiKeyEncrypted) {
    try {
      masked = maskApiKey(decryptSecret(record.apiKeyEncrypted));
    } catch {
      masked = "••••••••"; // decryption failure (e.g. key rotated) — never leak, never crash
    }
  }
  return {
    id: record.id,
    provider: record.provider,
    baseURL: record.baseURL,
    enabled: record.enabled,
    defaultModel: record.defaultModel,
    customHeaders: normalizeHeaders(record.customHeaders),
    organization: record.organization,
    hasApiKey: !!record.apiKeyEncrypted,
    apiKeyMasked: masked,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listProviderConfigs(userId: string): Promise<ProviderConfigView[]> {
  const rows = await prisma.providerConfig.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toView);
}

export async function getProviderConfig(
  userId: string,
  provider: string,
): Promise<ProviderConfigView | undefined> {
  const row = await prisma.providerConfig.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  return row ? toView(row) : undefined;
}

/** Server-only accessor: returns the DECRYPTED api key. Never expose this to a client response. */
export async function getDecryptedProviderConfig(
  userId: string,
  provider: string,
): Promise<{
  apiKey: string;
  baseURL: string | null;
  customHeaders: Record<string, string> | null;
  organization: string | null;
} | null> {
  const row = await prisma.providerConfig.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!row || !row.enabled || !row.apiKeyEncrypted) return null;
  return {
    apiKey: decryptSecret(row.apiKeyEncrypted),
    baseURL: row.baseURL,
    customHeaders: normalizeHeaders(row.customHeaders),
    organization: row.organization,
  };
}

export async function upsertProviderConfig(
  userId: string,
  input: ProviderConfigInput,
): Promise<ProviderConfigView> {
  const record = await prisma.providerConfig.upsert({
    where: { userId_provider: { userId, provider: input.provider } },
    create: {
      userId,
      provider: input.provider,
      apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : null,
      baseURL: input.baseURL ?? null,
      enabled: input.enabled ?? true,
      defaultModel: input.defaultModel ?? null,
      customHeaders: input.customHeaders ?? undefined,
      organization: input.organization ?? null,
    },
    update: {
      // Only overwrite the key when a new one is supplied — an empty/omitted
      // apiKey means "leave the existing key untouched".
      ...(input.apiKey ? { apiKeyEncrypted: encryptSecret(input.apiKey) } : {}),
      ...(input.baseURL !== undefined ? { baseURL: input.baseURL } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.defaultModel !== undefined ? { defaultModel: input.defaultModel } : {}),
      ...(input.customHeaders !== undefined
        ? { customHeaders: input.customHeaders ?? undefined }
        : {}),
      ...(input.organization !== undefined ? { organization: input.organization } : {}),
    },
  });
  return toView(record);
}

export async function patchProviderConfig(
  userId: string,
  id: string,
  input: Partial<ProviderConfigInput>,
): Promise<ProviderConfigView | undefined> {
  // Scope by both id AND userId so one user can never mutate another's row.
  const result = await prisma.providerConfig.updateMany({
    where: { id, userId },
    data: {
      ...(input.apiKey ? { apiKeyEncrypted: encryptSecret(input.apiKey) } : {}),
      ...(input.baseURL !== undefined ? { baseURL: input.baseURL } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.defaultModel !== undefined ? { defaultModel: input.defaultModel } : {}),
      ...(input.customHeaders !== undefined
        ? { customHeaders: input.customHeaders ?? undefined }
        : {}),
      ...(input.organization !== undefined ? { organization: input.organization } : {}),
    },
  });
  if (result.count === 0) return undefined;
  const row = await prisma.providerConfig.findFirst({ where: { id, userId } });
  return row ? toView(row) : undefined;
}

export async function deleteProviderConfig(userId: string, id: string): Promise<boolean> {
  const result = await prisma.providerConfig.deleteMany({ where: { id, userId } });
  return result.count > 0;
}
