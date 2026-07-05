import type { Prisma, UserPreferences } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * User preferences repository (Supabase PostgreSQL via Prisma).
 *
 * One row per user (1:1). Stores UI/behavioral defaults such as language,
 * theme, and the default/fallback provider + model used to seed new chats.
 */

export interface UserPreferencesView {
  language: string;
  theme: string;
  defaultProvider: string | null;
  defaultModel: string | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  defaultParameters: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferencesInput {
  language?: string;
  theme?: string;
  defaultProvider?: string | null;
  defaultModel?: string | null;
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  defaultParameters?: Record<string, unknown> | null;
}

function toView(p: UserPreferences): UserPreferencesView {
  return {
    language: p.language,
    theme: p.theme,
    defaultProvider: p.defaultProvider,
    defaultModel: p.defaultModel,
    fallbackProvider: p.fallbackProvider,
    fallbackModel: p.fallbackModel,
    defaultParameters: (p.defaultParameters as Record<string, unknown> | null) ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function getUserPreferences(userId: string): Promise<UserPreferencesView | null> {
  const row = await prisma.userPreferences.findUnique({ where: { userId } });
  return row ? toView(row) : null;
}

export async function upsertUserPreferences(
  userId: string,
  input: UserPreferencesInput,
): Promise<UserPreferencesView> {
  const params = input.defaultParameters as Prisma.InputJsonValue | undefined;
  const row = await prisma.userPreferences.upsert({
    where: { userId },
    create: {
      userId,
      language: input.language ?? "en",
      theme: input.theme ?? "system",
      defaultProvider: input.defaultProvider ?? null,
      defaultModel: input.defaultModel ?? null,
      fallbackProvider: input.fallbackProvider ?? null,
      fallbackModel: input.fallbackModel ?? null,
      defaultParameters: params,
    },
    update: {
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      ...(input.defaultProvider !== undefined ? { defaultProvider: input.defaultProvider } : {}),
      ...(input.defaultModel !== undefined ? { defaultModel: input.defaultModel } : {}),
      ...(input.fallbackProvider !== undefined
        ? { fallbackProvider: input.fallbackProvider }
        : {}),
      ...(input.fallbackModel !== undefined ? { fallbackModel: input.fallbackModel } : {}),
      ...(input.defaultParameters !== undefined ? { defaultParameters: params } : {}),
    },
  });
  return toView(row);
}
