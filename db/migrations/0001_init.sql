-- Reference migration — matches db/schema.prisma.
-- Not auto-applied by the running app (which currently uses the
-- dependency-free JSON store in src/lib/db/jsonStore.ts). Provided so the
-- production data model is version-controlled and ready to run against a
-- real Postgres/SQLite instance once you migrate off the JSON store.

CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS provider_configs (
    id                UUID PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL,
    api_key_encrypted TEXT,              -- AES-256-GCM ciphertext, base64
    base_url          TEXT,
    enabled           BOOLEAN NOT NULL DEFAULT true,
    default_model     TEXT,
    custom_headers    JSONB,
    organization      TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_provider_configs_user_id ON provider_configs(user_id);
