"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Conversation,
  ChatMessage,
  GenerationParameters,
  ProviderId,
  Folder,
  PromptLibraryItem,
} from "@/lib/providers/types";
import { v4 as uuid } from "uuid";

/* ============================================================
   Conversations store
   ============================================================ */
interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  folders: Folder[];
  favoriteModels: string[];
  recentModels: string[];

  /* conversation lifecycle */
  createConversation: (init?: Partial<Conversation>) => string;
  deleteConversation: (id: string) => void;
  setActive: (id: string | null) => void;
  renameConversation: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setConversationFolder: (id: string, folderId: string | null) => void;
  setConversationModel: (
    id: string,
    providerId: ProviderId,
    model: string,
  ) => void;
  setConversationSystemPrompt: (id: string, systemPrompt: string) => void;
  setConversationParameters: (
    id: string,
    parameters: GenerationParameters,
  ) => void;

  /* message lifecycle */
  addMessage: (convId: string, message: ChatMessage) => void;
  updateMessage: (convId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  deleteMessage: (convId: string, messageId: string) => void;
  truncateAfter: (convId: string, messageId: string) => void;

  /* folders */
  createFolder: (name: string) => string;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;

  /* model preferences */
  toggleFavoriteModel: (modelId: string) => void;
  pushRecentModel: (modelId: string) => void;

  /* import / export */
  exportAll: () => string;
  importData: (json: string) => boolean;
  clearAll: () => void;
}

const DEFAULT_PARAMETERS: GenerationParameters = {
  temperature: 0.7,
  topP: 1,
  maxTokens: 4096,
  responseFormat: "text",
};

function nowISO() {
  return new Date().toISOString();
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      folders: [],
      favoriteModels: [],
      recentModels: [],

      createConversation: (init) => {
        const id = init?.id || uuid();
        const conv: Conversation = {
          id,
          title: init?.title || "New conversation",
          messages: init?.messages || [],
          providerId: init?.providerId,
          model: init?.model,
          systemPrompt: init?.systemPrompt,
          parameters: init?.parameters || { ...DEFAULT_PARAMETERS },
          pinned: init?.pinned || false,
          favorite: init?.favorite || false,
          folderId: init?.folderId ?? null,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeId: id,
        }));
        return id;
      },

      deleteConversation: (id) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          const activeId =
            s.activeId === id
              ? conversations[0]?.id ?? null
              : s.activeId;
          return { conversations, activeId };
        }),

      setActive: (id) => set({ activeId: id }),

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title, updatedAt: nowISO() } : c,
          ),
        })),

      togglePin: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, pinned: !c.pinned } : c,
          ),
        })),

      toggleFavorite: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, favorite: !c.favorite } : c,
          ),
        })),

      setConversationFolder: (id, folderId) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, folderId } : c,
          ),
        })),

      setConversationModel: (id, providerId, model) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id
              ? { ...c, providerId, model, updatedAt: nowISO() }
              : c,
          ),
        })),

      setConversationSystemPrompt: (id, systemPrompt) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, systemPrompt } : c,
          ),
        })),

      setConversationParameters: (id, parameters) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, parameters } : c,
          ),
        })),

      addMessage: (convId, message) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [...c.messages, message],
                  updatedAt: nowISO(),
                  // Auto-title from first user message
                  title:
                    c.title === "New conversation" &&
                    message.role === "user"
                      ? truncateTitle(message.content)
                      : c.title,
                }
              : c,
          ),
        })),

      updateMessage: (convId, messageId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m,
                  ),
                  updatedAt: nowISO(),
                }
              : c,
          ),
        })),

      deleteMessage: (convId, messageId) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.filter((m) => m.id !== messageId),
                }
              : c,
          ),
        })),

      truncateAfter: (convId, messageId) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== convId) return c;
            const idx = c.messages.findIndex((m) => m.id === messageId);
            if (idx === -1) return c;
            return {
              ...c,
              messages: c.messages.slice(0, idx + 1),
            };
          }),
        })),

      createFolder: (name) => {
        const id = uuid();
        set((s) => ({
          folders: [
            ...s.folders,
            { id, name, createdAt: nowISO() },
          ],
        }));
        return id;
      },

      deleteFolder: (id) =>
        set((s) => ({
          folders: s.folders.filter((f) => f.id !== id),
          conversations: s.conversations.map((c) =>
            c.folderId === id ? { ...c, folderId: null } : c,
          ),
        })),

      renameFolder: (id, name) =>
        set((s) => ({
          folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)),
        })),

      toggleFavoriteModel: (modelId) =>
        set((s) => ({
          favoriteModels: s.favoriteModels.includes(modelId)
            ? s.favoriteModels.filter((m) => m !== modelId)
            : [...s.favoriteModels, modelId],
        })),

      pushRecentModel: (modelId) =>
        set((s) => ({
          recentModels: [
            modelId,
            ...s.recentModels.filter((m) => m !== modelId),
          ].slice(0, 8),
        })),

      exportAll: () => {
        const { conversations, folders, favoriteModels, recentModels } = get();
        return JSON.stringify(
          { version: 1, conversations, folders, favoriteModels, recentModels, exportedAt: nowISO() },
          null,
          2,
        );
      },

      importData: (json) => {
        try {
          const data = JSON.parse(json);
          if (!data || !Array.isArray(data.conversations)) return false;
          set((s) => ({
            conversations: [...data.conversations, ...s.conversations],
            folders: [...(data.folders || []), ...s.folders],
            favoriteModels: [...new Set([...(data.favoriteModels || []), ...s.favoriteModels])],
            recentModels: [...new Set([...(data.recentModels || []), ...s.recentModels])].slice(0, 8),
          }));
          return true;
        } catch {
          return false;
        }
      },

      clearAll: () =>
        set({
          conversations: [],
          activeId: null,
          folders: [],
        }),
    }),
    {
      name: "alaqami-chats-v1",
      version: 1,
      // Avoid persisting transient state
      partialize: (s) => ({
        conversations: s.conversations,
        folders: s.folders,
        favoriteModels: s.favoriteModels,
        recentModels: s.recentModels,
      }),
    },
  ),
);

function truncateTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 48) return trimmed;
  return trimmed.slice(0, 48).trimEnd() + "…";
}

/* ============================================================
   Settings store (provider config + user prefs)
   ============================================================ */
interface SettingsState {
  language: "en" | "ar";
  theme: "light" | "dark" | "system";
  defaultProvider?: ProviderId;
  defaultModel?: string;
  fallbackProvider?: ProviderId;
  fallbackModel?: string;
  defaultParameters: GenerationParameters;
  promptLibrary: PromptLibraryItem[];
  providers: Record<ProviderId, { enabled: boolean; apiKey: string; baseUrl?: string; customModels?: string; lastValidatedAt?: string }>;
  /** Transient: which providers have a server-side key configured (not persisted). */
  serverKeys: Partial<Record<ProviderId, boolean>>;

  setLanguage: (lang: "en" | "ar") => void;
  setServerKeys: (keys: Partial<Record<ProviderId, boolean>>) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setDefaultProvider: (providerId: ProviderId | undefined, model?: string) => void;
  setFallback: (providerId?: ProviderId, model?: string) => void;
  setDefaultParameters: (params: GenerationParameters) => void;
  setProviderConfig: (
    id: ProviderId,
    patch: Partial<{
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      customModels: string;
      lastValidatedAt: string;
    }>,
  ) => void;
  addPrompt: (item: Omit<PromptLibraryItem, "id" | "createdAt">) => void;
  updatePrompt: (id: string, patch: Partial<PromptLibraryItem>) => void;
  deletePrompt: (id: string) => void;
}

const DEFAULT_PROMPTS: PromptLibraryItem[] = [
  {
    id: "p-explain",
    title: "Explain like I'm 5",
    prompt:
      "Explain the following concept to me as if I were 5 years old. Use simple analogies and avoid jargon:\n\n",
    category: "Learning",
    createdAt: nowISO(),
  },
  {
    id: "p-code-review",
    title: "Code review",
    prompt:
      "Review the following code for bugs, performance issues, and readability. Suggest concrete improvements:\n\n```\n",
    category: "Development",
    createdAt: nowISO(),
  },
  {
    id: "p-summarize",
    title: "Summarize",
    prompt: "Summarize the following text in 3 bullet points:\n\n",
    category: "Writing",
    createdAt: nowISO(),
  },
  {
    id: "p-translate",
    title: "Translate to Arabic",
    prompt: "Translate the following text to Arabic, preserving tone and intent:\n\n",
    category: "Writing",
    createdAt: nowISO(),
  },
  {
    id: "p-brainstorm",
    title: "Brainstorm ideas",
    prompt: "Brainstorm 10 creative ideas about the following topic. Be specific and original:\n\n",
    category: "Creative",
    createdAt: nowISO(),
  },
];

const PROVIDER_DEFAULTS = {} as SettingsState["providers"];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: "en",
      theme: "system",
      defaultProvider: undefined,
      defaultModel: undefined,
      fallbackProvider: undefined,
      fallbackModel: undefined,
      defaultParameters: { ...DEFAULT_PARAMETERS },
      promptLibrary: DEFAULT_PROMPTS,
      providers: PROVIDER_DEFAULTS,
      serverKeys: {},

      setLanguage: (language) => set({ language }),
      setServerKeys: (serverKeys) => set({ serverKeys }),
      setTheme: (theme) => set({ theme }),
      setDefaultProvider: (defaultProvider, defaultModel) =>
        set({ defaultProvider, defaultModel }),
      setFallback: (fallbackProvider, fallbackModel) =>
        set({ fallbackProvider, fallbackModel }),
      setDefaultParameters: (defaultParameters) => set({ defaultParameters }),
      setProviderConfig: (id, patch) =>
        set((s) => ({
          providers: {
            ...s.providers,
            [id]: { ...s.providers[id], ...patch },
          },
        })),
      addPrompt: (item) =>
        set((s) => ({
          promptLibrary: [
            { ...item, id: uuid(), createdAt: nowISO() },
            ...s.promptLibrary,
          ],
        })),
      updatePrompt: (id, patch) =>
        set((s) => ({
          promptLibrary: s.promptLibrary.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),
      deletePrompt: (id) =>
        set((s) => ({
          promptLibrary: s.promptLibrary.filter((p) => p.id !== id),
        })),
    }),
    {
      name: "alaqami-settings-v1",
      version: 1,
      // serverKeys is transient (re-fetched on mount) — never persist it.
      partialize: (s) => ({
        language: s.language,
        theme: s.theme,
        defaultProvider: s.defaultProvider,
        defaultModel: s.defaultModel,
        fallbackProvider: s.fallbackProvider,
        fallbackModel: s.fallbackModel,
        defaultParameters: s.defaultParameters,
        promptLibrary: s.promptLibrary,
        providers: s.providers,
      }),
    },
  ),
);
