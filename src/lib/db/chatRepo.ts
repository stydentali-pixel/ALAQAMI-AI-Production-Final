import type { ChatMessage, ChatSession, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Chat history repository (Supabase PostgreSQL via Prisma).
 *
 * Persists chat sessions and their messages for authenticated users. Every
 * query is scoped by `userId` so users can only ever read/write their own
 * conversations. This backs optional server-side chat persistence; the
 * existing client-side (localStorage) chat store continues to work unchanged
 * for anonymous/BYOK usage.
 */

export interface ChatMessageView {
  id: string;
  role: string;
  content: string;
  model: string | null;
  providerId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: string;
}

export interface ChatSessionView {
  id: string;
  title: string;
  providerId: string | null;
  model: string | null;
  systemPrompt: string | null;
  parameters: Record<string, unknown> | null;
  pinned: boolean;
  favorite: boolean;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionWithMessages extends ChatSessionView {
  messages: ChatMessageView[];
}

export interface CreateChatSessionInput {
  title?: string;
  providerId?: string | null;
  model?: string | null;
  systemPrompt?: string | null;
  parameters?: Record<string, unknown> | null;
  pinned?: boolean;
  favorite?: boolean;
  folderId?: string | null;
}

export interface AppendMessageInput {
  role: string;
  content: string;
  model?: string | null;
  providerId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
}

function sessionToView(s: ChatSession): ChatSessionView {
  return {
    id: s.id,
    title: s.title,
    providerId: s.providerId,
    model: s.model,
    systemPrompt: s.systemPrompt,
    parameters: (s.parameters as Record<string, unknown> | null) ?? null,
    pinned: s.pinned,
    favorite: s.favorite,
    folderId: s.folderId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function messageToView(m: ChatMessage): ChatMessageView {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    model: m.model,
    providerId: m.providerId,
    promptTokens: m.promptTokens,
    completionTokens: m.completionTokens,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function listChatSessions(userId: string): Promise<ChatSessionView[]> {
  const rows = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(sessionToView);
}

export async function getChatSession(
  userId: string,
  sessionId: string,
): Promise<ChatSessionWithMessages | null> {
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) return null;
  return { ...sessionToView(session), messages: session.messages.map(messageToView) };
}

export async function createChatSession(
  userId: string,
  input: CreateChatSessionInput = {},
): Promise<ChatSessionView> {
  const session = await prisma.chatSession.create({
    data: {
      userId,
      title: input.title ?? "New conversation",
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      systemPrompt: input.systemPrompt ?? null,
      parameters: (input.parameters ?? undefined) as Prisma.InputJsonValue | undefined,
      pinned: input.pinned ?? false,
      favorite: input.favorite ?? false,
      folderId: input.folderId ?? null,
    },
  });
  return sessionToView(session);
}

export async function updateChatSession(
  userId: string,
  sessionId: string,
  input: Partial<CreateChatSessionInput>,
): Promise<ChatSessionView | null> {
  const result = await prisma.chatSession.updateMany({
    where: { id: sessionId, userId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
      ...(input.parameters !== undefined
        ? { parameters: (input.parameters ?? undefined) as Prisma.InputJsonValue | undefined }
        : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.favorite !== undefined ? { favorite: input.favorite } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    },
  });
  if (result.count === 0) return null;
  const row = await prisma.chatSession.findFirst({ where: { id: sessionId, userId } });
  return row ? sessionToView(row) : null;
}

export async function deleteChatSession(userId: string, sessionId: string): Promise<boolean> {
  const result = await prisma.chatSession.deleteMany({ where: { id: sessionId, userId } });
  return result.count > 0;
}

export async function appendMessage(
  userId: string,
  sessionId: string,
  input: AppendMessageInput,
): Promise<ChatMessageView | null> {
  // Verify ownership before inserting a child message.
  const owns = await prisma.chatSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!owns) return null;

  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        sessionId,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        providerId: input.providerId ?? null,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
      },
    }),
    // Touch the parent session so ordering by updatedAt reflects recent activity.
    prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } }),
  ]);
  return messageToView(message);
}
