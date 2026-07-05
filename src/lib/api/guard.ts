import type { NextRequest } from "next/server";

/**
 * Returns an error message if the request declares a body larger than
 * `maxBytes` via Content-Length, otherwise null. This is a best-effort
 * guard (a client could omit/lie about Content-Length), but it stops
 * naive oversized-payload abuse cheaply, before we ever call `req.json()`.
 */
export function checkBodySize(req: NextRequest, maxBytes: number): string | null {
  const len = req.headers.get("content-length");
  if (len && Number(len) > maxBytes) {
    return `Request body too large (max ${Math.floor(maxBytes / 1024)}KB)`;
  }
  return null;
}
