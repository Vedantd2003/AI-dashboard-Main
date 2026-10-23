import type { NextConfig } from 'next';

/**
 * The browser talks only to this origin. `/api/v1/*` is proxied server-side to the API service, so the session
 * cookie is first-party (SameSite=Lax) — see docs/SYSTEM_ARCHITECTURE.md. API_BASE_URL is read at build AND
 * start time; it is a server-only variable (no NEXT_PUBLIC_ prefix) and never reaches the bundle.
 */
const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@alphapulse/shared'],
  // The rewrite proxy aborts upstream requests after 30 s by default. Research runs are asynchronous now, but other
  // calls (a cold API instance on Render's free plan, RSS imports, PDF extraction) can still take longer.
  experimental: { proxyTimeout: 120_000 },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_BASE_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default config;
