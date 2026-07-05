import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Allow these image hosts for vision inputs (data: URLs always allowed).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // Vercel handles build output natively — no need for "standalone".

  // Baseline security headers (production-readiness hardening). These are
  // conservative and additive — they don't change any app behavior, only
  // browser-enforced protections.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
