# ALAQAMI AI

> Premium multi-provider AI workspace. One elegant interface for OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Together, Fireworks, NVIDIA NIM, Hugging Face, Mistral, Cohere, and any OpenAI-compatible endpoint.

Built with **Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui**. Deploys to Vercel in one click — no external database, no Docker, no Redis.

---

## ✨ Features

### Providers
- **13 providers supported out of the box**: OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Together, Fireworks, NVIDIA NIM, Hugging Face, Mistral, Cohere, OpenAI-compatible
- **Unified adapter pattern** — adding a new provider is a one-line operation
- **API keys stored locally** in the browser, never sent to a third-party service
- **Optional server-side env vars** — set keys on Vercel for personal deployments
- **Test connection** button for each provider
- **Default + fallback provider** configuration

### Chat
- **Streaming responses** via Server-Sent Events
- **Full Markdown rendering** with syntax-highlighted code blocks
- **Copy, edit, regenerate, retry, delete** actions on every message
- **Stop generation** mid-stream
- **Image upload** for vision-capable models
- **File upload** (text, code, markdown, JSON, CSV, etc.) injected as context
- **System prompt** per conversation with prompt library
- **Generation parameters**: temperature, top-p, max-tokens, response format

### Conversations
- **Local persistence** — every conversation survives refresh
- **Pinned chats** + **favorites**
- **Search** across all conversations
- **Auto-titling** from first user message
- **Folders** (organizational)
- **Export / import** all conversations as JSON

### Model Selector
- **Searchable** by name, label, description, provider
- **Grouped by provider** with provider color dots
- **Favorites** + **recently used** sections
- **Context window, vision, pricing badges**
- **Custom models** per provider (for OpenAI-compatible endpoints)

### UI / UX
- **Dark / Light / System** theme with smooth transitions
- **Arabic + English** with full **RTL support**
- **Premium minimal design** inspired by Linear, Vercel, Cursor, Claude
- **Fully responsive** — mobile, tablet, desktop
- **Keyboard shortcuts** — Enter to send, Shift+Enter for newline
- **Custom scrollbars**, animated brand logo, glass panels

### Persistence
Everything is stored in `localStorage`:
- Provider configurations + API keys
- All conversations + folders + pinned + favorites
- Prompt library + system prompts
- Theme + language preferences
- Favorite + recently used models

### Performance
- **Edge runtime** for all API routes
- **Code-split** per route
- **Tree-shaken** bundle
- **Lazy-loaded** icons
- **No external database** — zero cold-start cost

---

## 🚀 Deploy to Vercel

1. Push this repo to GitHub.
2. Import it on [vercel.com](https://vercel.com).
3. (Optional) Add any provider API keys as environment variables — see `.env.example`.
4. Deploy. That's it.

No database setup. No Docker. No Redis. No Supabase. No Prisma migrations.

---

## 🛠 Local Development

```bash
npm install
npm run dev
# → http://localhost:3000
```

```bash
npm run lint    # ESLint
npm run build   # Production build
```

---

## 🏗 Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                  # Unified streaming endpoint
│   │   └── providers/[providerId]/
│   │       ├── test/route.ts              # Test connection
│   │       └── models/route.ts            # List models
│   ├── settings/page.tsx                  # Settings UI
│   ├── layout.tsx                         # Root layout + providers
│   ├── page.tsx                           # Chat page
│   └── globals.css                        # Tailwind + design tokens
├── components/
│   ├── chat/
│   │   ├── chat-view.tsx                  # Orchestrator
│   │   ├── message-bubble.tsx             # User + assistant bubbles
│   │   ├── message-input.tsx              # Composer + attachments + params
│   │   ├── markdown-renderer.tsx          # Markdown + code blocks
│   │   └── empty-state.tsx                # Welcome screen with suggestions
│   ├── layout/
│   │   ├── app-shell.tsx                  # Top-level shell
│   │   ├── sidebar.tsx                    # Conversation list
│   │   ├── topbar.tsx                     # Model selector + theme/lang
│   │   ├── theme-toggle.tsx
│   │   └── language-toggle.tsx
│   ├── model-selector/
│   │   └── model-selector.tsx             # Searchable model picker
│   ├── providers/
│   │   └── app-providers.tsx              # Theme + i18n providers
│   └── ui/                                # shadcn/ui primitives
├── hooks/
│   └── use-chat.ts                        # Chat orchestration hook
└── lib/
    ├── i18n/
    │   ├── translations.ts                # Bilingual string catalog
    │   └── context.tsx                    # I18nProvider + useI18n hook
    ├── providers/
    │   ├── types.ts                       # Provider/model interfaces
    │   ├── catalog.ts                     # Static provider metadata
    │   └── adapters.ts                    # Protocol translation + SSE parsing
    └── store/
        └── index.ts                       # Zustand stores with persist
```

### Provider Adapters

Each provider speaks one of five protocols:
- **`openai-chat`** — OpenAI `/v1/chat/completions` (OpenAI, Groq, DeepSeek, Together, Fireworks, NVIDIA, Hugging Face, Mistral, OpenAI-compatible)
- **`openrouter`** — OpenAI-compatible with extra attribution headers
- **`anthropic`** — Anthropic `/v1/messages` (separate system prompt, different SSE event types)
- **`gemini`** — Google `streamGenerateContent` with `?alt=sse`
- **`cohere`** — Cohere v2 chat with different SSE event names

The `buildRequest()` function translates a canonical `ChatCompletionRequest` into the provider's native format. The `parseChunk()` function normalizes streaming chunks back into `{text?, done?, usage?, error?}`. Adding a new provider = append to `PROVIDER_CATALOG` + add a case to each function.

---

## Backend Architecture (v2)

ALAQAMI AI supports two credential modes side by side:

Mode 1 - BYOK (default, unchanged): key lives in browser localStorage, sent with every request, no auth required, set via the existing Settings UI.
Mode 2 - Server-side storage (new): key is encrypted at rest in the server database, requires an authenticated session (`/api/auth/*`), set via `POST`/`PATCH /api/settings`.

Flow:
```
Client -> /api/chat { mode: "byok" | "server", apiKey?, ... }
              |
              v
   Unified Provider Manager (src/lib/providers/manager.ts)
      - mode "byok"   -> use client-supplied key (+ optional server env fallback)
      - mode "server" -> session -> decrypt stored key just-in-time
              |
              v
        Provider adapters (unchanged) -> upstream AI provider
```

New modules:
- `src/lib/security/encryption.ts` - AES-256-GCM for API keys at rest (key from `ENCRYPTION_KEY`)
- `src/lib/security/auth.ts` - email/password auth, opaque server-side sessions (httpOnly cookie)
- `src/lib/db/jsonStore.ts` - the database layer (see rationale + migration path inside)
- `src/lib/db/providerConfigRepo.ts` - encrypted CRUD for provider configs
- `src/lib/providers/manager.ts` - resolves BYOK vs. server-stored credentials
- `src/app/api/auth/*`, `src/app/api/settings` - new endpoints, all returning `{ success, data, error, timestamp }`

Database: a single JSON file on disk (`db/store.json` by default), chosen because the app runs as a persistent Node/Bun process (see `.zscripts/start.sh`), not stateless edge functions, so a file is a legitimate durable store here. It's fully isolated behind `collection()`, so swapping in Postgres/SQLite later is mechanical - see `db/schema.prisma` and `db/migrations/0001_init.sql` for the reference schema.

---

## Security

- **API keys never leave the browser in BYOK mode** unless the user explicitly makes a request — then they're sent over HTTPS to the server-side API route, which forwards them to the provider and discards them.
- **Server-stored keys (Mode 2) are encrypted at rest** with AES-256-GCM and decrypted only in-memory, per request, inside the Node runtime. Decrypted keys are never logged or returned to the client — only a masked preview.
- **No third-party analytics**. No telemetry. No tracking.
- **Server env vars** (optional) are only read at request time on the server and never exposed to the client.
- **All inputs validated** on both client and server; all new API responses are JSON, never HTML.

---

## 📄 License

Personal use. All rights reserved.

---

**ALAQAMI AI** — Premium AI Workspace.
