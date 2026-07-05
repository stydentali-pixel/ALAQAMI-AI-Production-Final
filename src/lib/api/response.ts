import { NextResponse } from "next/server";

/**
 * Standard API envelope used by the new backend endpoints (`/api/auth/*`,
 * `/api/settings`). Every response — success or failure — has this exact
 * shape and is always JSON, never HTML.
 *
 * NOTE: pre-existing endpoints (`/api/chat`, `/api/providers/*`) keep their
 * original response shapes (e.g. `{ ok, error }`) intentionally, since the
 * current frontend already parses those shapes and the brief calls for
 * preserving existing UI/UX. Only genuinely new endpoints adopt this
 * envelope so nothing already wired up in the client breaks.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  timestamp: string;
}

export function apiOk<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { success: true, data, error: null, timestamp: new Date().toISOString() },
    { status },
  );
}

export function apiError(error: string, status = 400): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    { success: false, data: null, error, timestamp: new Date().toISOString() },
    { status },
  );
}

/** Wraps a route handler so any thrown/unhandled error still returns valid JSON. */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unexpected server error";
      console.error("[api] unhandled error:", message);
      return apiError(message, 500);
    }
  };
}
