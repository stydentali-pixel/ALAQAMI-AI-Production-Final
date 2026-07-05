import { prisma } from "@/lib/db/prisma";

/**
 * Usage statistics repository (Supabase PostgreSQL via Prisma).
 *
 * Aggregates token usage and request counts per user / provider / model /
 * day. Recording is idempotent-friendly via an upsert on the composite
 * unique key `(userId, provider, model, day)`, incrementing counters on
 * conflict. Recording is best-effort and must never break a chat request.
 */

export interface RecordUsageInput {
  userId: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

/** Normalizes a timestamp to a UTC date (midnight) for daily bucketing. */
function toUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const prompt = input.promptTokens ?? 0;
  const completion = input.completionTokens ?? 0;
  const total = prompt + completion;
  const day = toUtcDay();

  try {
    await prisma.usageStatistic.upsert({
      where: {
        userId_provider_model_day: {
          userId: input.userId,
          provider: input.provider,
          model: input.model,
          day,
        },
      },
      create: {
        userId: input.userId,
        provider: input.provider,
        model: input.model,
        day,
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total,
        requestCount: 1,
      },
      update: {
        promptTokens: { increment: prompt },
        completionTokens: { increment: completion },
        totalTokens: { increment: total },
        requestCount: { increment: 1 },
      },
    });
  } catch (err) {
    console.error("[usage] failed to record usage:", (err as Error)?.message);
  }
}

export interface UsageSummaryRow {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

export async function getUsageSummary(
  userId: string,
  sinceDays = 30,
): Promise<UsageSummaryRow[]> {
  const since = toUtcDay();
  since.setUTCDate(since.getUTCDate() - Math.max(sinceDays - 1, 0));

  const grouped = await prisma.usageStatistic.groupBy({
    by: ["provider", "model"],
    where: { userId, day: { gte: since } },
    _sum: {
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      requestCount: true,
    },
  });

  return grouped.map((g) => ({
    provider: g.provider,
    model: g.model,
    promptTokens: g._sum.promptTokens ?? 0,
    completionTokens: g._sum.completionTokens ?? 0,
    totalTokens: g._sum.totalTokens ?? 0,
    requestCount: g._sum.requestCount ?? 0,
  }));
}
