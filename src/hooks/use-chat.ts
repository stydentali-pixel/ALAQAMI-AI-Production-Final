"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useChatStore, useSettingsStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n/context";
import { PROVIDER_MAP } from "@/lib/providers/catalog";
import type {
  ChatMessage,
  Conversation,
  GenerationParameters,
  ProviderId,
} from "@/lib/providers/types";
import { v4 as uuid } from "uuid";

interface SendOptions {
  /** Override the conversation's provider/model for this single send. */
  providerId?: ProviderId;
  model?: string;
  /** Override generation parameters for this single send. */
  parameters?: GenerationParameters;
  /** Override the system prompt for this single send. */
  systemPrompt?: string;
  /** Triggered on each text delta received. */
  onChunk?: (text: string) => void;
}

interface UseChatReturn {
  send: (conv: Conversation, userMessage: ChatMessage) => Promise<void>;
  regenerate: (conv: Conversation) => Promise<void>;
  stop: () => void;
  isStreaming: boolean;
}

/**
 * The single chat orchestration hook. Handles:
 *  - persisting the user message
 *  - appending an empty assistant message that gets patched as tokens stream in
 *  - calling /api/chat with the resolved API key
 *  - SSE parsing
 *  - error → fallback provider retry
 *  - abort via AbortController
 */
export function useChat(): UseChatReturn {
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const truncateAfter = useChatStore((s) => s.truncateAfter);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const pushRecentModel = useChatStore((s) => s.pushRecentModel);
  const providers = useSettingsStore((s) => s.providers);
  const serverKeys = useSettingsStore((s) => s.serverKeys);
  const fallbackProvider = useSettingsStore((s) => s.fallbackProvider);
  const fallbackModel = useSettingsStore((s) => s.fallbackModel);
  const { t } = useI18n();

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const callApi = useCallback(
    async (
      conv: Conversation,
      providerId: ProviderId,
      model: string,
      parameters: GenerationParameters,
      systemPrompt: string | undefined,
      assistantId: string,
      onChunk?: (s: string) => void,
    ): Promise<{ ok: boolean; error?: string }> => {
      const cfg = providers[providerId];
      const apiKey = cfg?.apiKey || "";

      // Build the message list — last assistant placeholder is excluded
      const realMessages = conv.messages.filter((m) => m.id !== assistantId);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          model,
          messages: realMessages,
          parameters,
          systemPrompt,
          stream: true,
          apiKey,
          baseUrl: cfg?.baseUrl,
        } as const),
        signal: abortRef.current?.signal,
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        return {
          ok: false,
          error: (err as any)?.error || `HTTP ${response.status}`,
        };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLines = event
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim());
          for (const line of dataLines) {
            if (!line) continue;
            try {
              const obj = JSON.parse(line);
              if (obj.text) {
                acc += obj.text;
                onChunk?.(obj.text);
                updateMessage(conv.id, assistantId, { content: acc });
              }
              if (obj.usage) {
                updateMessage(conv.id, assistantId, { usage: obj.usage });
              }
              if (obj.error) {
                return { ok: false, error: obj.error };
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      return { ok: true };
    },
    [providers, updateMessage],
  );

  const runWithFallback = useCallback(
    async (
      conv: Conversation,
      providerId: ProviderId,
      model: string,
      parameters: GenerationParameters,
      systemPrompt: string | undefined,
      assistantId: string,
      onChunk?: (s: string) => void,
    ) => {
      const primary = await callApi(
        conv,
        providerId,
        model,
        parameters,
        systemPrompt,
        assistantId,
        onChunk,
      );
      if (primary.ok) return primary;

      // Try fallback
      if (
        fallbackProvider &&
        fallbackModel &&
        (fallbackProvider !== providerId || fallbackModel !== model)
      ) {
        const cfg = providers[fallbackProvider];
        if (cfg?.apiKey) {
          updateMessage(conv.id, assistantId, {
            content: "",
            provider: fallbackProvider,
            model: fallbackModel,
          });
          const fb = await callApi(
            conv,
            fallbackProvider,
            fallbackModel,
            parameters,
            systemPrompt,
            assistantId,
            onChunk,
          );
          if (fb.ok) return fb;
        }
      }
      return primary;
    },
    [callApi, fallbackProvider, fallbackModel, providers, updateMessage],
  );

  const send = useCallback(
    async (conv: Conversation, userMessage: ChatMessage) => {
      // 1. Persist the user message
      addMessage(conv.id, userMessage);

      // 2. Resolve provider+model+params+system prompt
      const providerId =
        userMessage.provider ||
        conv.providerId ||
        useSettingsStore.getState().defaultProvider;
      const model =
        userMessage.model ||
        conv.model ||
        useSettingsStore.getState().defaultModel;

      if (!providerId || !model) {
        toast.error(t("errors.noApiKey"));
        return;
      }
      const provider = PROVIDER_MAP[providerId];
      if (!provider) {
        toast.error(t("errors.unknownProvider"));
        return;
      }

      const cfg = providers[providerId];
      if (
        !cfg?.apiKey &&
        !serverKeys[providerId] &&
        providerId !== "openai-compatible"
      ) {
        toast.error(t("errors.noApiKey"));
        return;
      }

      const parameters =
        conv.parameters || useSettingsStore.getState().defaultParameters;
      const systemPrompt = conv.systemPrompt;

      // 3. Insert empty assistant placeholder
      const assistantId = uuid();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        provider: providerId,
        model,
        createdAt: new Date().toISOString(),
      };
      addMessage(conv.id, assistantMessage);

      pushRecentModel(model);
      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const result = await runWithFallback(
          { ...conv, messages: [...conv.messages, userMessage] },
          providerId,
          model,
          parameters,
          systemPrompt,
          assistantId,
        );
        if (!result.ok) {
          updateMessage(conv.id, assistantId, {
            error: result.error || t("errors.unknown"),
            content: result.error || t("errors.unknown"),
          });
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          // User stopped — keep whatever we have so far
        } else {
          updateMessage(conv.id, assistantId, {
            error: e?.message || t("errors.network"),
            content: e?.message || t("errors.network"),
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, providers, serverKeys, pushRecentModel, runWithFallback, t, updateMessage],
  );

  const regenerate = useCallback(
    async (conv: Conversation) => {
      // Find last assistant message; truncate everything after the previous user message
      const lastAssistantIdx = [...conv.messages]
        .reverse()
        .findIndex((m) => m.role === "assistant");
      if (lastAssistantIdx === -1) return;
      const realIdx = conv.messages.length - 1 - lastAssistantIdx;
      const lastAssistant = conv.messages[realIdx];
      const prevUser = [...conv.messages.slice(0, realIdx)].reverse().find((m) => m.role === "user");
      if (!prevUser) return;

      // Truncate the conversation up to and including the previous user message
      truncateAfter(conv.id, prevUser.id);
      // Delete the old assistant message
      deleteMessage(conv.id, lastAssistant.id);

      // Re-send
      const providerId = lastAssistant.provider || conv.providerId;
      const model = lastAssistant.model || conv.model;
      if (!providerId || !model) return;

      const parameters = conv.parameters || useSettingsStore.getState().defaultParameters;
      const systemPrompt = conv.systemPrompt;

      const assistantId = uuid();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        provider: providerId,
        model,
        createdAt: new Date().toISOString(),
      };
      addMessage(conv.id, assistantMessage);

      pushRecentModel(model);
      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const truncatedConv = useChatStore
          .getState()
          .conversations.find((c) => c.id === conv.id);
        if (!truncatedConv) return;
        const result = await runWithFallback(
          truncatedConv,
          providerId,
          model,
          parameters,
          systemPrompt,
          assistantId,
        );
        if (!result.ok) {
          updateMessage(conv.id, assistantId, {
            error: result.error || t("errors.unknown"),
            content: result.error || t("errors.unknown"),
          });
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          updateMessage(conv.id, assistantId, {
            error: e?.message || t("errors.network"),
            content: e?.message || t("errors.network"),
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, deleteMessage, pushRecentModel, runWithFallback, truncateAfter, updateMessage],
  );

  return { send, regenerate, stop, isStreaming };
}
