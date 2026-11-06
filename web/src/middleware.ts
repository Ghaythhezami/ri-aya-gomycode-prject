import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // `app` is the backoffice SPA (public/app) and `api` the proxied API: never localise them.
  matcher: ['/', '/(ar|en|fr)/:path*', '/((?!api|app(?:/|$)|_next|_vercel|.*\\..*).*)'],
};
