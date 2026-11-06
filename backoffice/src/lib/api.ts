import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { errorMessage, negotiateLocale } from '@riaya/shared';
import i18n from '../i18n';
import type { ApiError, AuthResponse } from './types';

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  // Read at request time so a language switch applies without a reload (AC-005).
  config.headers['Accept-Language'] = i18n.language;
  return config;
});

/**
 * The ONE way to refresh the session. Refresh tokens rotate and a reused token
 * revokes its family, so concurrent callers (boot restore, 401 retries from
 * parallel requests, StrictMode double effects) must share a single request.
 */
export function refreshSession(): Promise<AuthResponse> {
  refreshPromise ??= api
    .post<AuthResponse>('/api/auth/refresh')
    .then(({ data }) => {
      accessToken = data.accessToken;
      return data;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as
      (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url ?? '';
    const isAuthPath = url.includes('/api/auth/login') || url.includes('/api/auth/refresh');

    if (error.response?.status === 401 && original && !original._retry && !isAuthPath) {
      original._retry = true;
      try {
        const token = (await refreshSession()).accessToken;
        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }
      } catch {
        accessToken = null;
        onUnauthorized?.();
      }
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown, fallback?: string) {
  const axiosError = error as AxiosError<ApiError>;
  const message = axiosError.response?.data?.message;
  if (message) return message;

  // The server localizes known codes; an unknown code or a network failure
  // falls back to the shared catalogue, then to the caller's localized text.
  const code = axiosError.response?.data?.code;
  const locale = negotiateLocale(i18n.language);
  return errorMessage(code, locale) ?? fallback ?? i18n.t('errors.generic');
}
