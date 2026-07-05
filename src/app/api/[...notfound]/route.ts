import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Catch-all for any /api/* path that doesn't match a real route.
 *
 * Next.js's default behavior for an unmatched route is to render its HTML
 * 404 page — even under /api/*. If client code does `await res.json()` on
 * that response, it fails with "Unexpected token '<', "<!DOCTYPE"...".
 * This route ensures every /api/* request — matched or not — gets a JSON
 * response with a proper status code.
 */
function notFound(req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: `No API route matches ${req.method} ${req.nextUrl.pathname}`,
    },
    { status: 404 },
  );
}

export const GET = notFound;
export const POST = notFound;
export const PATCH = notFound;
export const PUT = notFound;
export const DELETE = notFound;
