import type {
  ChatMessage,
  GenerationParameters,
  ProviderId,
  ProviderProtocol,
} from "./types";
import { PROVIDER_MAP } from "./catalog";

/**
 * Canonical request the UI/API emits. Adapters translate this into
 * the provider's native format.
 */
export interface ChatCompletionRequest {
  providerId: ProviderId;
  model: string;
  messages: ChatMessage[];
  parameters: GenerationParameters;
  /** Optional system prompt prepended before messages. */
  systemPrompt?: string;
  /** Whether to stream the response (server-side adapters always stream). */
  stream: boolean;
  /** API key — if undefined, the adapter tries the server env var. */
  apiKey?: string;
  /** Optional base URL override (used by openai-compatible). */
  baseUrl?: string;
}

export interface AdapterResult {
  /** Outgoing URL. */
  url: string;
  /** Outgoing headers. */
  headers: Record<string, string>;
  /** Outgoing body (already serialized). */
  body: string;
  /** The protocol that was used to build the request — used by the chunk parser. */
  protocol: ProviderProtocol;
}

/**
 * Build the outgoing HTTP request for a given provider.
 * Returns the URL, headers, and serialized body. The caller is responsible
 * for fetching and then piping the response through `parseStreamChunk`.
 */
export function buildRequest(req: ChatCompletionRequest): AdapterResult {
  const provider = PROVIDER_MAP[req.providerId];
  if (!provider) {
    throw new Error(`Unknown provider: ${req.providerId}`);
  }

  const baseUrl = (req.baseUrl || provider.baseUrl).replace(/\/$/, "");
  const apiKey = req.apiKey || "";

  switch (provider.protocol) {
    case "openai-chat":
      return buildOpenAIChat(req, baseUrl, apiKey);
    case "openrouter":
      return buildOpenRouter(req, baseUrl, apiKey);
    case "anthropic":
      return buildAnthropic(req, baseUrl, apiKey);
    case "gemini":
      return buildGemini(req, baseUrl, apiKey);
    case "cohere":
      return buildCohere(req, baseUrl, apiKey);
    default:
      throw new Error(`Unsupported protocol: ${provider.protocol satisfies never}`);
  }
}

/* ---------------- OpenAI-compatible ---------------- */
function buildOpenAIChat(
  req: ChatCompletionRequest,
  baseUrl: string,
  apiKey: string,
): AdapterResult {
  const url = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const messages = toOpenAIMessages(req);

  const body = JSON.stringify({
    model: req.model,
    messages,
    temperature: req.parameters.temperature,
    top_p: req.parameters.topP,
    max_tokens: req.parameters.maxTokens,
    stream: req.stream,
    ...(req.parameters.responseFormat === "json"
      ? { response_format: { type: "json_object" } }
      : {}),
  });

  return { url, headers, body, protocol: "openai-chat" };
}

/* ---------------- OpenRouter (OpenAI-compatible + extra headers) ---------------- */
function buildOpenRouter(
  req: ChatCompletionRequest,
  baseUrl: string,
  apiKey: string,
): AdapterResult {
  const result = buildOpenAIChat(req, baseUrl, apiKey);
  // OpenRouter recommends these extra headers for ranking & attribution
  result.headers["HTTP-Referer"] = "https://alaqami.ai";
  result.headers["X-Title"] = "ALAQAMI AI";
  result.protocol = "openrouter";
  return result;
}

/* ---------------- Anthropic /v1/messages ---------------- */
function buildAnthropic(
  req: ChatCompletionRequest,
  baseUrl: string,
  apiKey: string,
): AdapterResult {
  const url = `${baseUrl}/messages`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "anthropic-version": "2023-06-01",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  // Anthropic separates system prompt from messages
  const { system, messages } = toAnthropicMessages(req);

  const body = JSON.stringify({
    model: req.model,
    system,
    messages,
    max_tokens: req.parameters.maxTokens,
    temperature: req.parameters.temperature,
    top_p: req.parameters.topP,
    stream: req.stream,
  });

  return { url, headers, body, protocol: "anthropic" };
}

/* ---------------- Google Gemini streamGenerateContent ---------------- */
function buildGemini(
  req: ChatCompletionRequest,
  baseUrl: string,
  apiKey: string,
): AdapterResult {
  const url = `${baseUrl}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  const systemInstruction = req.systemPrompt
    ? { parts: [{ text: req.systemPrompt }] }
    : undefined;
  const contents = toGeminiContents(req);

  const body = JSON.stringify({
    contents,
    ...(systemInstruction ? { systemInstruction } : {}),
    generationConfig: {
      temperature: req.parameters.temperature,
      topP: req.parameters.topP,
      maxOutputTokens: req.parameters.maxTokens,
      ...(req.parameters.responseFormat === "json"
        ? { responseMimeType: "application/json" }
        : {}),
    },
  });

  return { url, headers, body, protocol: "gemini" };
}

/* ---------------- Cohere v2/chat ---------------- */
function buildCohere(
  req: ChatCompletionRequest,
  baseUrl: string,
  apiKey: string,
): AdapterResult {
  const url = `${baseUrl}/chat`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const messages = toCohereMessages(req);

  const body = JSON.stringify({
    model: req.model,
    messages,
    temperature: req.parameters.temperature,
    p: req.parameters.topP,
    max_tokens: req.parameters.maxTokens,
    stream: req.stream,
  });

  return { url, headers, body, protocol: "cohere" };
}

/* ---------------- Message translation helpers ---------------- */
type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string | any[];
};

function toOpenAIMessages(req: ChatCompletionRequest): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  if (req.systemPrompt) {
    out.push({ role: "system", content: req.systemPrompt });
  }
  for (const m of req.messages) {
    if (m.role === "system" && !req.systemPrompt) {
      out.push({ role: "system", content: m.content });
      continue;
    }
    if (m.role === "system") continue;

    // For vision-capable messages, build multimodal content
    if (m.images && m.images.length > 0) {
      const content: any[] = [
        { type: "text", text: m.content || "" },
        ...m.images.map((img) => ({
          type: "image_url",
          image_url: { url: img.url },
        })),
      ];
      out.push({ role: m.role as "user" | "assistant", content });
    } else if (m.attachments && m.attachments.length > 0) {
      const text = [
        m.content || "",
        ...m.attachments.map(
          (a) => `\n\n--- ${a.name} ---\n${a.text}`,
        ),
      ].join("");
      out.push({ role: m.role as "user" | "assistant", content: text });
    } else {
      out.push({ role: m.role as "user" | "assistant", content: m.content });
    }
  }
  return out;
}

function toAnthropicMessages(req: ChatCompletionRequest): {
  system: string | undefined;
  messages: { role: "user" | "assistant"; content: any }[];
} {
  const systemText = req.systemPrompt
    ? req.systemPrompt
    : req.messages.find((m) => m.role === "system")?.content;

  const system = systemText || undefined;
  const messages: { role: "user" | "assistant"; content: any }[] = [];

  for (const m of req.messages) {
    if (m.role === "system") continue;

    if (m.images && m.images.length > 0) {
      const content: any[] = [
        ...(m.content ? [{ type: "text", text: m.content }] : []),
        ...m.images.map((img) => ({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mimeType,
            data: img.url.split(",")[1] || "",
          },
        })),
      ];
      messages.push({ role: m.role as "user" | "assistant", content });
    } else if (m.attachments && m.attachments.length > 0) {
      const text = [
        m.content || "",
        ...m.attachments.map((a) => `\n\n--- ${a.name} ---\n${a.text}`),
      ].join("");
      messages.push({ role: m.role as "user" | "assistant", content: text });
    } else {
      messages.push({ role: m.role as "user" | "assistant", content: m.content });
    }
  }
  return { system, messages };
}

function toGeminiContents(req: ChatCompletionRequest): any[] {
  const contents: any[] = [];
  for (const m of req.messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "model" : "user";
    const parts: any[] = [];
    if (m.content) parts.push({ text: m.content });
    if (m.attachments) {
      for (const a of m.attachments) {
        parts.push({ text: `\n\n--- ${a.name} ---\n${a.text}` });
      }
    }
    if (m.images) {
      for (const img of m.images) {
        const data = img.url.split(",")[1] || "";
        parts.push({ inlineData: { mimeType: img.mimeType, data } });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return contents;
}

function toCohereMessages(req: ChatCompletionRequest): any[] {
  const out: any[] = [];
  if (req.systemPrompt) {
    out.push({ role: "system", content: req.systemPrompt });
  }
  for (const m of req.messages) {
    if (m.role === "system" && !req.systemPrompt) {
      out.push({ role: "system", content: m.content });
      continue;
    }
    if (m.role === "system") continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/* ============================================================
   Stream chunk parsing
   Each provider emits SSE-style data: lines. We parse a single
   JSON-parsed event into a normalized {text?, done?, usage?} result.
   ============================================================ */
export interface ParsedChunk {
  text?: string;
  done?: boolean;
  usage?: { promptTokens?: number; completionTokens?: number };
  error?: string;
}

export function parseChunk(
  protocol: ProviderProtocol,
  json: any,
): ParsedChunk {
  switch (protocol) {
    case "openai-chat":
    case "openrouter":
      return parseOpenAI(json);
    case "anthropic":
      return parseAnthropic(json);
    case "gemini":
      return parseGemini(json);
    case "cohere":
      return parseCohere(json);
    default:
      return {};
  }
}

function parseOpenAI(json: any): ParsedChunk {
  if (json.choices?.[0]?.delta?.content) {
    return { text: json.choices[0].delta.content };
  }
  if (json.choices?.[0]?.finish_reason) {
    return { done: true, usage: json.usage };
  }
  if (json.usage) {
    return { usage: json.usage };
  }
  return {};
}

function parseAnthropic(json: any): ParsedChunk {
  if (json.type === "content_block_delta" && json.delta?.text) {
    return { text: json.delta.text };
  }
  if (json.type === "message_start" && json.message?.usage) {
    return { usage: { promptTokens: json.message.usage.input_tokens } };
  }
  if (json.type === "message_delta" && json.usage) {
    return { usage: { completionTokens: json.usage.output_tokens } };
  }
  if (json.type === "message_stop") {
    return { done: true };
  }
  if (json.error) {
    return { error: json.error.message || "Anthropic error" };
  }
  return {};
}

function parseGemini(json: any): ParsedChunk {
  if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
    return { text: json.candidates[0].content.parts[0].text };
  }
  if (json.candidates?.[0]?.finishReason) {
    return { done: true };
  }
  if (json.usageMetadata) {
    return {
      usage: {
        promptTokens: json.usageMetadata.promptTokenCount,
        completionTokens: json.usageMetadata.candidatesTokenCount,
      },
    };
  }
  return {};
}

function parseCohere(json: any): ParsedChunk {
  if (json.type === "content-delta" && json.delta?.message?.content?.text) {
    return { text: json.delta.message.content.text };
  }
  if (json.type === "message-end") {
    return { done: true };
  }
  return {};
}
