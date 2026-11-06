import type {
  AlternativeSlot,
  AppointmentDetail,
  AppointmentListItem,
  AppointmentStatus,
  BulkActionResult,
  ChangeAppointmentTypeInput,
  Paginated,
  ReminderDto,
  UpdateAppointmentInput,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export interface AppointmentListQuery {
  from?: string;
  to?: string;
  doctorId?: string;
  specialty?: string;
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

/** Everything an appointment change can touch, so lists, calendar and queue refresh. */
const AFFECTED = ['Appointment', 'Dashboard', 'Schedule', 'Queue', 'Patient', 'Doctor'] as const;

export const appointmentsApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    apptList: build.query<Paginated<AppointmentListItem>, AppointmentListQuery>({
      query: (params) => ({ url: '/api/appointments', params: { ...params } }),
      providesTags: ['Appointment'],
    }),
    apptCalendar: build.query<
      AppointmentListItem[],
      { from: string; to: string; doctorId?: string }
    >({
      query: (params) => ({ url: '/api/appointments/calendar', params: { ...params } }),
      providesTags: ['Appointment'],
    }),
    apptDetail: build.query<AppointmentDetail, string>({
      query: (id) => ({ url: `/api/appointments/${id}` }),
      providesTags: ['Appointment'],
    }),
    apptSetStatus: build.mutation<
      AppointmentDetail,
      { id: string; status: AppointmentStatus; reason?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/api/appointments/${id}/status`, method: 'POST', body }),
      invalidatesTags: [...AFFECTED],
    }),
    apptCancel: build.mutation<AppointmentDetail, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/api/appointments/${id}/cancel`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: [...AFFECTED],
    }),
    apptBulk: build.mutation<
      BulkActionResult,
      { ids: string[]; action: 'CONFIRM' | 'CANCEL'; reason?: string }
    >({
      query: (body) => ({ url: '/api/appointments/bulk', method: 'POST', body }),
      invalidatesTags: [...AFFECTED],
    }),
    apptUpdate: build.mutation<AppointmentDetail, { id: string } & UpdateAppointmentInput>({
      query: ({ id, ...body }) => ({ url: `/api/appointments/${id}`, method: 'PATCH', body }),
      invalidatesTags: [...AFFECTED],
    }),
    apptChangeType: build.mutation<AppointmentDetail, { id: string } & ChangeAppointmentTypeInput>({
      query: ({ id, ...body }) => ({ url: `/api/appointments/${id}/type`, method: 'PATCH', body }),
      invalidatesTags: [...AFFECTED],
    }),
    apptAlternatives: build.query<AlternativeSlot[], string>({
      query: (id) => ({ url: `/api/appointments/${id}/alternatives` }),
      providesTags: ['Appointment'],
    }),
    apptRetryReminder: build.mutation<ReminderDto, string>({
      query: (id) => ({ url: `/api/appointments/reminders/${id}/retry`, method: 'POST' }),
      invalidatesTags: ['Appointment', 'Notification'],
    }),
  }),
});

export const {
  useApptListQuery,
  useApptCalendarQuery,
  useApptDetailQuery,
  useApptSetStatusMutation,
  useApptCancelMutation,
  useApptBulkMutation,
  useApptUpdateMutation,
  useApptChangeTypeMutation,
  useApptRetryReminderMutation,
} = appointmentsApi;
