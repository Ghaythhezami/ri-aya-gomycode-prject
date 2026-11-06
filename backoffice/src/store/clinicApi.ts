import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import { api } from '../lib/api';

/** Error shape every clinic endpoint rejects with (from the API's global filter). */
export interface ClinicApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

interface AxiosArgs {
  url: string;
  method?: AxiosRequestConfig['method'];
  body?: unknown;
  params?: Record<string, unknown>;
  responseType?: AxiosRequestConfig['responseType'];
}

/**
 * RTK Query over the shared axios client, so clinic endpoints inherit the
 * in-memory access token, the silent refresh on 401 and the Accept-Language header.
 */
const axiosBaseQuery: BaseQueryFn<AxiosArgs | string, unknown, ClinicApiError> = async (args) => {
  const request = typeof args === 'string' ? { url: args } : args;
  try {
    const result = await api.request({
      url: request.url,
      method: request.method ?? 'GET',
      data: request.body,
      params: request.params,
      responseType: request.responseType,
    });
    return { data: result.data };
  } catch (raw) {
    const error = raw as AxiosError<{ code?: string; message?: string; details?: unknown }>;
    return {
      error: {
        status: error.response?.status ?? 0,
        code: error.response?.data?.code ?? (error.response ? 'INTERNAL_ERROR' : 'NETWORK_ERROR'),
        message: error.response?.data?.message ?? error.message,
        details: error.response?.data?.details,
      },
    };
  }
};

export const CLINIC_TAGS = [
  'Reference',
  'Appointment',
  'Patient',
  'Doctor',
  'Queue',
  'Schedule',
  'Dashboard',
  'Analytics',
  'Notification',
  'Settings',
  'Audit',
  'Chat',
  'Profile',
  'Onboarding',
] as const;

/**
 * Feature modules add endpoints with `clinicApi.injectEndpoints` in
 * `src/features/<feature>/api.ts`; nothing is declared here.
 */
export const clinicApi = createApi({
  reducerPath: 'clinicApi',
  baseQuery: axiosBaseQuery,
  tagTypes: CLINIC_TAGS,
  // Live screens poll as a fallback when the realtime socket is unavailable.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});

/** Narrow an RTK Query error to the clinic API error. */
export function asClinicError(error: unknown): ClinicApiError | null {
  if (error && typeof error === 'object' && 'code' in error && 'status' in error) {
    return error as ClinicApiError;
  }
  return null;
}
