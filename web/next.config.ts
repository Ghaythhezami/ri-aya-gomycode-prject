import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * The API runs as its own Vercel project. Proxying it under this origin keeps the
 * HttpOnly refresh cookie first-party (SameSite=Lax) for the backoffice at /app.
 */
const apiOrigin = (process.env.API_ORIGIN ?? 'http://localhost:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pnpm monorepo: trace server files from the repository root, not a stray lockfile above it.
  outputFileTracingRoot: path.join(__dirname, '..'),
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
        // `/app` itself is a directory in public/, which Next does not serve: map it explicitly.
        { source: '/app', destination: '/app/index.html' },
      ],
      afterFiles: [],
      // The backoffice is a single-page app copied to public/app at build time:
      // any /app route that is not a static file falls back to its index.html.
      // Hashed assets are excluded: a missing chunk must 404, never return HTML that
      // would then be cached as an immutable script.
      fallback: [{ source: '/app/:path((?!assets/).*)', destination: '/app/index.html' }],
    };
  },
  async headers() {
    return [
      {
        source: '/app/assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/app/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
