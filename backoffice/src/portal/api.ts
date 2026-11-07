import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import type {
  PatientDocumentDto,
  PortalAppointment,
  PortalBookInput,
  PortalClinic,
  PortalDoctor,
  PortalRescheduleInput,
  PortalSlot,
  PortalSummary,
} from '@riaya/shared';
import { portalHttp, type PortalApiError } from './lib/session';

export interface PortalAppointmentType {
  /** Code sent back as `type` when booking. */
  type: string;
  name: string;
  durationMinutes?: number;
}

export interface PortalQueryError {
  status?: number;
  data?: PortalApiError;
}

/** RTK Query transport over the portal axios client (own token, shared refresh, own base URL). */
const portalBaseQuery: BaseQueryFn<
  { url: string; method?: AxiosRequestConfig['method']; params?: unknown; data?: unknown },
  unknown,
  PortalQueryError
> = async ({ url, method = 'GET', params, data }) => {
  try {
    const result = await portalHttp.request({ url, method, params, data });
    return { data: result.data };
  } catch (error) {
    const e = error as AxiosError<PortalApiError>;
    return { error: { status: e.response?.status, data: e.response?.data } };
  }
};

export const portalApi = createApi({
  reducerPath: 'portalApi',
  baseQuery: portalBaseQuery,
  tagTypes: ['Appointments', 'Documents', 'Summary'],
  endpoints: (builder) => ({
    clinics: builder.query<PortalClinic[], void>({ query: () => ({ url: '/clinics' }) }),
    doctors: builder.query<PortalDoctor[], void>({ query: () => ({ url: '/doctors' }) }),
    appointmentTypes: builder.query<PortalAppointmentType[], void>({
      query: () => ({ url: '/appointment-types' }),
    }),
    slots: builder.query<
      PortalSlot[],
      { doctorId: string; date: string; durationMinutes?: number }
    >({
      query: (params) => ({ url: '/slots', params }),
    }),
    appointments: builder.query<PortalAppointment[], 'upcoming' | 'past'>({
      query: (scope) => ({ url: '/appointments', params: { scope } }),
      providesTags: ['Appointments'],
    }),
    book: builder.mutation<PortalAppointment, PortalBookInput>({
      query: (data) => ({ url: '/appointments', method: 'POST', data }),
      invalidatesTags: ['Appointments'],
    }),
    cancel: builder.mutation<PortalAppointment, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/appointments/${id}/cancel`,
        method: 'POST',
        data: reason ? { reason } : {},
      }),
      invalidatesTags: ['Appointments'],
    }),
    reschedule: builder.mutation<PortalAppointment, { id: string } & PortalRescheduleInput>({
      query: ({ id, ...data }) => ({ url: `/appointments/${id}/reschedule`, method: 'POST', data }),
      invalidatesTags: ['Appointments'],
    }),
    summary: builder.query<PortalSummary | null, void>({
      query: () => ({ url: '/summary' }),
      providesTags: ['Summary'],
    }),
    documents: builder.query<PatientDocumentDto[], void>({
      query: () => ({ url: '/documents' }),
      providesTags: ['Documents'],
    }),
  }),
});

export const {
  useClinicsQuery,
  useDoctorsQuery,
  useAppointmentTypesQuery,
  useSlotsQuery,
  useAppointmentsQuery,
  useBookMutation,
  useCancelMutation,
  useRescheduleMutation,
  useSummaryQuery,
  useDocumentsQuery,
} = portalApi;
