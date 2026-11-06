import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// The staff workspace is a separate static Vite project (backoffice/); the landing never serves it.
const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://riaya-app.vercel.app').replace(
  /\/$/,
  '',
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pnpm monorepo: trace server files from the repository root, not a stray lockfile above it.
  outputFileTracingRoot: path.join(__dirname, '..'),
  async redirects() {
    return [
      // Old links from when the workspace lived under /app.
      { source: '/app', destination: appOrigin, permanent: true },
      { source: '/app/:path*', destination: `${appOrigin}/:path*`, permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
