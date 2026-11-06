import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Never localise the permanent /app redirect, the API, Next internals or metadata files
  // (opengraph-image, icon, manifest, sitemap.xml, robots.txt).
  matcher: [
    '/',
    '/(ar|en|fr)/:path*',
    '/((?!api|app(?:/|$)|_next|_vercel|opengraph-image|twitter-image|icon|apple-icon|manifest|.*\..*).*)',
  ],
};
