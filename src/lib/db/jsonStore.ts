import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * Database layer
 * ---------------
 * ALAQAMI AI is deployed as a long-running Node/Bun process (see
 * `.zscripts/start.sh`, which boots `server.js` behind Caddy) rather than as
 * stateless edge functions — so a persistent file on disk is a valid and
 * durable storage backend here, unlike on ephemeral serverless platforms.
 *
 * This module implements a small, dependency-free "database": a single JSON
 * file on disk, guarded by an in-process write queue (so concurrent writes
 * from the same process never interleave/corrupt the file) and written
 * atomically (write to a temp file, then rename — rename is atomic on POSIX
 * filesystems, so a crash mid-write can never leave a half-written file).
 *
 * It is intentionally isolated behind the `Collection<T>` interface below so
 * it can be swapped for a real database (Postgres via Prisma/Drizzle, or
 * SQLite via `bun:sqlite`) without touching any calling code — see
 * `db/migrations/0001_init.sql` and `db/schema.prisma` for the reference
 * schema that documents the intended production shape of this data.
 */

export interface DbSchema {
  users: UserRecord[];
  sessions: SessionRecord[];
  providerConfigs: ProviderConfigRecord[];
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string; // scrypt hash, format: "<salt-hex>:<hash-hex>"
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

/** Persisted (encrypted) shape of a provider configuration — matches REQUIREMENTS #1. */
export interface ProviderConfigRecord {
  id: string;
  userId: string;
  provider: string;
  apiKeyEncrypted: string | null;
  baseURL: string | null;
  enabled: boolean;
  defaultModel: string | null;
  customHeaders: Record<string, string> | null;
  organization: string | null;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "db");
const DATA_FILE = join(DATA_DIR, process.env.DATA_FILE_NAME || "store.json");

function emptySchema(): DbSchema {
  return { users: [], sessions: [], providerConfigs: [] };
}

function ensureFile(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, JSON.stringify(emptySchema(), null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

function readAll(): DbSchema {
  ensureFile();
  try {
    const raw = readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<DbSchema>;
    return {
      users: parsed.users ?? [],
      sessions: parsed.sessions ?? [],
      providerConfigs: parsed.providerConfigs ?? [],
    };
  } catch {
    // Corrupt or empty file — never crash the server; start fresh rather
    // than take the whole app down. This is logged, not swallowed silently.
    console.error(
      "[db] store.json was unreadable/corrupt — reinitializing empty store.",
    );
    return emptySchema();
  }
}

function writeAll(data: DbSchema): void {
  ensureFile();
  const tmpFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tmpFile, DATA_FILE); // atomic on POSIX
}

// Serializes writes within this process so concurrent async handlers can't
// clobber each other (read-modify-write races).
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => T): Promise<T> {
  const result = writeQueue.then(fn);
  writeQueue = result.catch(() => undefined);
  return result;
}

export type CollectionName = keyof DbSchema;

/**
 * Generic collection accessor. Every operation is queued so reads always
 * see a consistent snapshot relative to prior writes from this process.
 */
export function collection<K extends CollectionName>(name: K) {
  type Row = DbSchema[K][number];

  return {
    async list(): Promise<Row[]> {
      return enqueue(() => readAll()[name] as Row[]);
    },

    async find(predicate: (row: Row) => boolean): Promise<Row | undefined> {
      return enqueue(() => (readAll()[name] as Row[]).find(predicate));
    },

    async filter(predicate: (row: Row) => boolean): Promise<Row[]> {
      return enqueue(() => (readAll()[name] as Row[]).filter(predicate));
    },

    async insert(row: Row): Promise<Row> {
      return enqueue(() => {
        const data = readAll();
        (data[name] as Row[]).push(row);
        writeAll(data);
        return row;
      });
    },

    async update(
      predicate: (row: Row) => boolean,
      patch: (row: Row) => Row,
    ): Promise<Row | undefined> {
      return enqueue(() => {
        const data = readAll();
        const rows = data[name] as Row[];
        const idx = rows.findIndex(predicate);
        if (idx === -1) return undefined;
        rows[idx] = patch(rows[idx]);
        writeAll(data);
        return rows[idx];
      });
    },

    async remove(predicate: (row: Row) => boolean): Promise<boolean> {
      return enqueue(() => {
        const data = readAll();
        const rows = data[name] as Row[];
        const before = rows.length;
        data[name] = rows.filter((r) => !predicate(r)) as DbSchema[K];
        writeAll(data);
        return (data[name] as Row[]).length < before;
      });
    },
  };
}

/** Removes expired sessions. Safe to call opportunistically on login/session checks. */
export async function pruneExpiredSessions(): Promise<void> {
  const now = Date.now();
  await enqueue(() => {
    const data = readAll();
    data.sessions = data.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
    writeAll(data);
  });
}
