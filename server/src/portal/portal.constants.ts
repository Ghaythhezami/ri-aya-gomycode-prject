/** Access-token audience of patient (portal) tokens; the staff strategy rejects it. */
export const PORTAL_AUDIENCE = 'riaya-portal';
/** `typ` claim of portal access tokens. */
export const PORTAL_TOKEN_TYPE = 'patient';
/** Refresh cookie (httpOnly) and the only path it is sent to. */
export const PORTAL_REFRESH_COOKIE = 'portal_refresh';
export const PORTAL_REFRESH_PATH = '/api/portal/auth';
export const PORTAL_REFRESH_DAYS = 30;
export const PORTAL_ACCESS_EXPIRES = '15m';
/** Open appointments a patient may hold at once. */
export const MAX_FUTURE_APPOINTMENTS = 3;
/** Open appointments an unverified (self-registered) account may hold at once. */
export const MAX_FUTURE_APPOINTMENTS_UNVERIFIED = 1;
