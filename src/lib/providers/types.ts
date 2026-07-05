/**
 * ALAQAMI AI — Provider & Model Types
 *
 * The provider system is designed around a single canonical interface
 * (`ChatCompletionRequest`) that the UI emits. Each provider adapter is
 * responsible for translating that request into the provider's native
 * format and parsing streaming chunks back into a normalized stream
 * of text deltas.
 */

export type ProviderId =
  | "gateway"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "groq"
  | "deepseek"
  | "together"
  | "fireworks"
  | "nvidia"
  | "huggingface"
  | "mistral"
  | "cohere"
  | "openai-compatible";

export type ProviderProtocol =
  | "openai-chat" // OpenAI /v1/chat/completions (covers most)
  | "anthropic" // Anthropic /v1/messages
  | "gemini" // Google /v1beta/models/...:streamGenerateContent
  | "cohere" // Cohere /v2/chat
  | "openrouter"; // OpenAI-compatible with extra headers

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  arabicName: string;
  description: string;
  arabicDescription: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  docsUrl: string;
  apiKeyUrl: string;
  /** The env var name that, if set on the server, can override the client-supplied key. */
  serverEnvKey?: string;
  /** Suggested default models to surface in the picker. */
  popularModels: ModelDefinition[];
  /** Whether this provider supports streaming. */
  supportsStreaming: boolean;
  /** Whether vision (image input) is supported on at least some models. */
  supportsVision: boolean;
  /** Accent color (hex) for the provider logo chip. */
  accent: string;
}

export interface ModelDefinition {
  id: string;
  /** Display name shown in the picker. */
  name: string;
  /** Optional pretty label, e.g. "GPT-4o". */
  label?: string;
  description?: string;
  arabicDescription?: string;
  provider: ProviderId;
  contextWindow?: number;
  maxOutput?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  /** Free / paid tag. */
  pricing?: "free" | "freemium" | "paid";
  badge?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Optional image attachments (data URLs) for vision-capable models. */
  images?: { url: string; mimeType: string }[];
  /** Optional file attachments (raw text content) for context. */
  attachments?: { name: string; type: string; text: string }[];
  /** Model that produced this message (assistant only). */
  model?: string;
  /** Provider that produced this message. */
  provider?: ProviderId;
  /** ISO timestamp. */
  createdAt: string;
  /** Token usage if known. */
  usage?: { promptTokens?: number; completionTokens?: number };
  /** Marks an assistant message that errored. */
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  /** Provider + model used as default for new turns in this conversation. */
  providerId?: ProviderId;
  model?: string;
  systemPrompt?: string;
  /** Generation parameters snapshot. */
  parameters?: GenerationParameters;
  pinned?: boolean;
  favorite?: boolean;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationParameters {
  temperature: number;
  topP: number;
  maxTokens: number;
  /** Optional JSON-mode / structured-output hint. */
  responseFormat?: "text" | "json";
}

export interface ProviderConfig {
  enabled: boolean;
  apiKey: string;
  /** Optional override of the base URL (for OpenAI-compatible providers). */
  baseUrl?: string;
  /** Custom models added by the user (in addition to defaults). */
  customModels?: ModelDefinition[];
  /** Last time the connection was tested successfully. */
  lastValidatedAt?: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: string;
}

export interface PromptLibraryItem {
  id: string;
  title: string;
  prompt: string;
  category: string;
  createdAt: string;
}

export interface SystemPromptPreset {
  id: string;
  title: string;
  prompt: string;
  description: string;
  icon: string;
}

export interface UserSettings {
  /** Active language. */
  language: "en" | "ar";
  /** Active theme. */
  theme: "light" | "dark" | "system";
  /** Default provider used for new conversations. */
  defaultProvider?: ProviderId;
  /** Default model used for new conversations. */
  defaultModel?: string;
  /** Fallback provider used when the default errors out. */
  fallbackProvider?: ProviderId;
  /** Fallback model. */
  fallbackModel?: string;
  /** Default generation parameters. */
  defaultParameters: GenerationParameters;
  /** Whether to send usage telemetry to console (dev only). */
  debug: boolean;
}
