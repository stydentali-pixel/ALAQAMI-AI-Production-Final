"use client";

import { useEffect, useMemo, useRef } from "react";
import { useChatStore, useSettingsStore } from "@/lib/store";
import { useChat } from "@/hooks/use-chat";
import { useI18n } from "@/lib/i18n/context";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { EmptyState } from "./empty-state";
import type { ChatMessage } from "@/lib/providers/types";
import { v4 as uuid } from "uuid";
import {
  Sparkles,
  Code2,
  Mail,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatView() {
  const { t } = useI18n();
  const activeId = useChatStore((s) => s.activeId);
  const conversations = useChatStore((s) => s.conversations);
  const conversation = conversations.find((c) => c.id === activeId);
  const createConversation = useChatStore((s) => s.createConversation);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setConversationParameters = useChatStore((s) => s.setConversationParameters);
  const setConversationSystemPrompt = useChatStore((s) => s.setConversationSystemPrompt);
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const defaultParameters = useSettingsStore((s) => s.defaultParameters);
  const providers = useSettingsStore((s) => s.providers);
  const serverKeys = useSettingsStore((s) => s.serverKeys);

  const { send, regenerate, stop, isStreaming } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only autoscroll if user is near the bottom
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [conversation?.messages, isStreaming]);

  const messages = conversation?.messages || [];

  const handleSend = (content: string, opts: {
    images?: { url: string; mimeType: string }[];
    attachments?: { name: string; type: string; text: string }[];
  }) => {
    let convId = activeId;
    let conv = conversation;
    if (!convId || !conv) {
      convId = createConversation({
        providerId: defaultProvider,
        model: defaultModel,
        parameters: defaultParameters,
      });
      conv = useChatStore
        .getState()
        .conversations.find((c) => c.id === convId);
    }
    if (!conv) return;
    const userMessage: ChatMessage = {
      id: uuid(),
      role: "user",
      content,
      images: opts.images,
      attachments: opts.attachments,
      createdAt: new Date().toISOString(),
    };
    void send(conv, userMessage);
  };

  const handleRegenerate = (assistantMessageId: string) => {
    if (!conversation) return;
    void regenerate(conversation);
  };

  const handleEditUserMessage = (messageId: string, newContent: string) => {
    if (!conversation) return;
    updateMessage(conversation.id, messageId, { content: newContent });
    // Truncate everything after the edited message and resend
    const idx = conversation.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const editedMsg = conversation.messages[idx];
    useChatStore.getState().truncateAfter(conversation.id, messageId);
    // Delete any messages after the edited user message
    for (const m of conversation.messages.slice(idx + 1)) {
      deleteMessage(conversation.id, m.id);
    }
    // Re-send with the edited content
    const updated = useChatStore
      .getState()
      .conversations.find((c) => c.id === conversation.id);
    if (!updated) return;
    void send(updated, { ...editedMsg, content: newContent });
  };

  const hasProvider = useMemo(() => {
    if (!defaultProvider) return false;
    return !!providers[defaultProvider]?.apiKey || !!serverKeys[defaultProvider];
  }, [defaultProvider, providers, serverKeys]);

  if (!conversation || messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          <EmptyState onPick={(s) => handleSend(s, {})} disabled={!hasProvider} />
        </div>
        <MessageInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={stop}
          parameters={conversation?.parameters || defaultParameters}
          onParametersChange={(p) => {
            if (conversation) setConversationParameters(conversation.id, p);
            else useSettingsStore.getState().setDefaultParameters(p);
          }}
          systemPrompt={conversation?.systemPrompt}
          onSystemPromptChange={(p) => {
            if (conversation) setConversationSystemPrompt(conversation.id, p || "");
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="max-w-3xl mx-auto py-4">
          {messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              message={m}
              conversation={conversation}
              isLast={i === messages.length - 1 && m.role === "assistant"}
              isStreaming={
                isStreaming && i === messages.length - 1 && m.role === "assistant"
              }
              onRegenerate={() => handleRegenerate(m.id)}
              onEdit={(newContent) => handleEditUserMessage(m.id, newContent)}
              onDelete={() => deleteMessage(conversation.id, m.id)}
            />
          ))}
        </div>
      </div>
      <MessageInput
        onSend={handleSend}
        isStreaming={isStreaming}
        onStop={stop}
        parameters={conversation.parameters || defaultParameters}
        onParametersChange={(p) => setConversationParameters(conversation.id, p)}
        systemPrompt={conversation.systemPrompt}
        onSystemPromptChange={(p) => setConversationSystemPrompt(conversation.id, p || "")}
      />
    </div>
  );
}
