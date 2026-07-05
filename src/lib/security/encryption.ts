import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encryption
 * ----------
 * AES-256-GCM authenticated encryption for secrets (provider API keys) at
 * rest in the database. The master key is never stored in the database —
 * it comes from the `ENCRYPTION_KEY` environment variable and is derived
 * into a 32-byte key via scrypt with a static, non-secret salt (the secret
 * material is the env var itself, not the salt).
 *
 * Ciphertext format (base64 of the concatenation):
 *   [12-byte IV][16-byte auth tag][ciphertext bytes]
 *
 * This module must only ever run in a Node.js runtime (not edge) — it is
 * imported exclusively by server-only code paths (API routes with
 * `export const runtime = "nodejs"`).
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = "alaqami-ai.encryption.v1"; // non-secret, fixed — key strength comes from ENCRYPTION_KEY

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.trim().length < 16) {
    throw new Error(
      "ENCRYPTION_KEY is not set (or too short). Set a strong random secret " +
        "(32+ chars) in the environment before storing provider credentials.",
    );
  }

  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** Encrypts a plaintext secret. Returns a base64 string safe to store in the DB. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Decrypts a value produced by `encryptSecret`. Throws if the payload was tampered with. */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Produces a display-safe masked version of an API key, e.g. "sk-ab...9f2k".
 * Never send full decrypted keys to the client — only this mask.
 */
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
