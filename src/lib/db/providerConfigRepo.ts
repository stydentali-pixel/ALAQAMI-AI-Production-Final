import { randomUUID } from "node:crypto";
import { collection, type ProviderConfigRecord } from "@/lib/db/jsonStore";
import { encryptSecret, decryptSecret, maskApiKey } from "@/lib/security/encryption";

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

function toView(record: ProviderConfigRecord): ProviderConfigView {
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
    customHeaders: record.customHeaders,
    organization: record.organization,
    hasApiKey: !!record.apiKeyEncrypted,
    apiKeyMasked: masked,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listProviderConfigs(userId: string): Promise<ProviderConfigView[]> {
  const rows = await collection("providerConfigs").filter((r) => r.userId === userId);
  return rows.map(toView);
}

export async function getProviderConfig(
  userId: string,
  provider: string,
): Promise<ProviderConfigView | undefined> {
  const row = await collection("providerConfigs").find(
    (r) => r.userId === userId && r.provider === provider,
  );
  return row ? toView(row) : undefined;
}

/** Server-only accessor: returns the DECRYPTED api key. Never expose this to a client response. */
export async function getDecryptedProviderConfig(
  userId: string,
  provider: string,
): Promise<{ apiKey: string; baseURL: string | null; customHeaders: Record<string, string> | null; organization: string | null } | null> {
  const row = await collection("providerConfigs").find(
    (r) => r.userId === userId && r.provider === provider,
  );
  if (!row || !row.enabled || !row.apiKeyEncrypted) return null;
  return {
    apiKey: decryptSecret(row.apiKeyEncrypted),
    baseURL: row.baseURL,
    customHeaders: row.customHeaders,
    organization: row.organization,
  };
}

export async function upsertProviderConfig(
  userId: string,
  input: ProviderConfigInput,
): Promise<ProviderConfigView> {
  const existing = await collection("providerConfigs").find(
    (r) => r.userId === userId && r.provider === input.provider,
  );
  const now = new Date().toISOString();

  if (existing) {
    const updated = await collection("providerConfigs").update(
      (r) => r.id === existing.id,
      (r) => ({
        ...r,
        apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : r.apiKeyEncrypted,
        baseURL: input.baseURL !== undefined ? input.baseURL : r.baseURL,
        enabled: input.enabled !== undefined ? input.enabled : r.enabled,
        defaultModel: input.defaultModel !== undefined ? input.defaultModel : r.defaultModel,
        customHeaders: input.customHeaders !== undefined ? input.customHeaders : r.customHeaders,
        organization: input.organization !== undefined ? input.organization : r.organization,
        updatedAt: now,
      }),
    );
    return toView(updated!);
  }

  const record: ProviderConfigRecord = {
    id: randomUUID(),
    userId,
    provider: input.provider,
    apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : null,
    baseURL: input.baseURL ?? null,
    enabled: input.enabled ?? true,
    defaultModel: input.defaultModel ?? null,
    customHeaders: input.customHeaders ?? null,
    organization: input.organization ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await collection("providerConfigs").insert(record);
  return toView(inserted);
}

export async function patchProviderConfig(
  userId: string,
  id: string,
  input: Partial<ProviderConfigInput>,
): Promise<ProviderConfigView | undefined> {
  const updated = await collection("providerConfigs").update(
    (r) => r.id === id && r.userId === userId,
    (r) => ({
      ...r,
      apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : r.apiKeyEncrypted,
      baseURL: input.baseURL !== undefined ? input.baseURL : r.baseURL,
      enabled: input.enabled !== undefined ? input.enabled : r.enabled,
      defaultModel: input.defaultModel !== undefined ? input.defaultModel : r.defaultModel,
      customHeaders: input.customHeaders !== undefined ? input.customHeaders : r.customHeaders,
      organization: input.organization !== undefined ? input.organization : r.organization,
      updatedAt: new Date().toISOString(),
    }),
  );
  return updated ? toView(updated) : undefined;
}

export async function deleteProviderConfig(userId: string, id: string): Promise<boolean> {
  return collection("providerConfigs").remove((r) => r.id === id && r.userId === userId);
}
