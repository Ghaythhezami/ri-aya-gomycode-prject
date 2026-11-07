import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { errorMessage, negotiateLocale, type PortalAuthResponse } from '@riaya/shared';
import i18n from '../../i18n';

/**
 * The patient portal's own HTTP client (ADR 0005 §1). It never shares the staff client's
 * token or refresh cookie: base `/api/portal`, an in-memory access token, and a single
 * shared refresh request (refresh tokens rotate; a reused one revokes its family, so
 * concurrent callers must share one call).
 */
let accessToken: string | null = null;
let refreshPromise: Promise<PortalAuthResponse> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setPortalUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}
let onDisabled: (() => void) | null = null;
/** Called when the clinic switched the portal off (403 PORTAL_DISABLED): sign the patient out. */
export function setPortalDisabledHandler(handler: (() => void) | null) {
  onDisabled = handler;
}
export function setPortalAccessToken(token: string | null) {
  accessToken = token;
}
export function getPortalAccessToken() {
  return accessToken;
}

export const portalHttp = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || ''}/api/portal`,
  withCredentials: true,
});

portalHttp.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Read at request time so a language switch applies without a reload.
  config.headers['Accept-Language'] = i18n.language;
  return config;
});

/** The ONE way to refresh the portal session. Concurrent callers share one request. */
export function refreshPortalSession(): Promise<PortalAuthResponse> {
  refreshPromise ??= portalHttp
    .post<PortalAuthResponse>('/auth/refresh')
    .then(({ data }) => {
      accessToken = data.accessToken;
      return data;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/register', '/auth/accept-invite'];

portalHttp.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url ?? '';
    const isAuthPath = AUTH_PATHS.some((p) => url.includes(p));
    const data = error.response?.data as PortalApiError | undefined;
    if (error.response?.status === 403 && data?.code === 'PORTAL_DISABLED' && !isAuthPath) {
      accessToken = null;
      onDisabled?.();
    }
    if (error.response?.status === 401 && original && !original._retry && !isAuthPath) {
      original._retry = true;
      try {
        const token = (await refreshPortalSession()).accessToken;
        original.headers.Authorization = `Bearer ${token}`;
        return portalHttp(original);
      } catch {
        accessToken = null;
        onUnauthorized?.();
      }
    }
    return Promise.reject(error);
  },
);

export interface PortalApiError {
  code?: string;
  message?: string;
  details?: unknown;
}

export function portalErrorCode(error: unknown): string | undefined {
  return (error as AxiosError<PortalApiError>)?.response?.data?.code;
}

export function portalErrorStatus(error: unknown): number | undefined {
  return (error as AxiosError)?.response?.status;
}

export function portalErrorDetails(error: unknown): unknown {
  return (error as AxiosError<PortalApiError>)?.response?.data?.details;
}

/** Server message (already localised), then the shared catalogue, then the fallback. */
export function portalErrorMessage(error: unknown, fallback: string): string {
  const data = (error as AxiosError<PortalApiError>)?.response?.data;
  if (data?.message) return data.message;
  return errorMessage(data?.code, negotiateLocale(i18n.language)) ?? fallback;
}
