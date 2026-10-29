import { createApi, fetchBaseQuery, type FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { AuthResponse, AuthUser } from '../lib/types';

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_BASE_URL || '',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as { auth: { accessToken: string | null } }).auth.accessToken;
      if (token) headers.set('authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, { email: string; password: string }>({
      query: (body) => ({ url: '/api/auth/login', method: 'POST', body }),
    }),
    logout: builder.mutation<{ success: boolean }, void>({
      query: () => ({ url: '/api/auth/logout', method: 'POST' }),
    }),
    refresh: builder.mutation<AuthResponse, void>({
      query: () => ({ url: '/api/auth/refresh', method: 'POST' }),
    }),
    // Authoritative source for the signed-in user's active role (D13): the login
    // and refresh payloads can lag behind the membership role.
    me: builder.query<AuthUser, void>({
      query: () => ({ url: '/api/auth/me' }),
    }),
    forgotPassword: builder.mutation<{ success: boolean; message: string }, { email: string }>({
      query: (body) => ({ url: '/api/auth/forgot-password', method: 'POST', body }),
    }),
    resetPassword: builder.mutation<{ success: boolean }, { token: string; password: string }>({
      query: (body) => ({ url: '/api/auth/reset-password', method: 'POST', body }),
    }),
  }),
});

export const {
  useLoginMutation,
  useLogoutMutation,
  useRefreshMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = apiSlice;

export function rtkErrorMessage(error: unknown, fallback: string) {
  const fetchError = error as FetchBaseQueryError | undefined;
  if (fetchError && typeof fetchError === 'object' && 'data' in fetchError) {
    const data = fetchError.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}
