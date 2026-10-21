import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from './types';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
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
  return config;
});

async function refreshAccessToken() {
  const { data } = await api.post<{ accessToken: string }>('/api/auth/refresh');
  accessToken = data.accessToken;
  return accessToken;
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
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const token = await refreshPromise;
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

export function getErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<ApiError>;
  return axiosError.response?.data?.message ?? fallback;
}
