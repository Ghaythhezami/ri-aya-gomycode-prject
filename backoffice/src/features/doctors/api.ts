import type {
  CreateDoctorInput,
  DoctorCard,
  DoctorDetail,
  LeaveDto,
  WorkingInterval,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export interface DoctorListParams {
  date?: string;
  from?: string;
  to?: string;
  search?: string;
  specialty?: string;
}

export const doctorsApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    doctors: build.query<DoctorCard[], DoctorListParams>({
      query: (params) => ({ url: '/api/doctors', params: { ...params } }),
      providesTags: ['Doctor'],
    }),
    doctor: build.query<DoctorDetail, { id: string; date?: string; from?: string; to?: string }>({
      query: ({ id, date, from, to }) => ({
        url: `/api/doctors/${id}`,
        params: { date, from, to },
      }),
      providesTags: (_r, _e, { id }) => [{ type: 'Doctor', id }],
    }),
    createDoctor: build.mutation<DoctorDetail, CreateDoctorInput>({
      query: (body) => ({ url: '/api/doctors', method: 'POST', body }),
      invalidatesTags: ['Doctor', 'Reference', 'Schedule'],
    }),
    updateDoctor: build.mutation<DoctorDetail, { id: string; body: Partial<CreateDoctorInput> }>({
      query: ({ id, body }) => ({ url: `/api/doctors/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Doctor', 'Reference'],
    }),
    deactivateDoctor: build.mutation<{ flagged: number }, string>({
      query: (id) => ({ url: `/api/doctors/${id}/deactivate`, method: 'POST' }),
      invalidatesTags: ['Doctor', 'Reference', 'Appointment', 'Schedule', 'Dashboard'],
    }),
    activateDoctor: build.mutation<DoctorDetail, string>({
      query: (id) => ({ url: `/api/doctors/${id}/activate`, method: 'POST' }),
      invalidatesTags: ['Doctor', 'Reference', 'Schedule'],
    }),
    putWorkingHours: build.mutation<
      DoctorDetail,
      { id: string; intervals: WorkingInterval[]; confirm?: boolean }
    >({
      query: ({ id, intervals, confirm }) => ({
        url: `/api/doctors/${id}/working-hours`,
        method: 'PUT',
        body: confirm ? { intervals, confirm } : { intervals },
      }),
      invalidatesTags: ['Doctor', 'Appointment', 'Schedule'],
    }),
    addLeave: build.mutation<
      LeaveDto,
      { id: string; startsAt: string; endsAt: string; reason?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/api/doctors/${id}/leaves`, method: 'POST', body }),
      invalidatesTags: ['Doctor', 'Schedule'],
    }),
    deleteLeave: build.mutation<{ success: true }, { id: string; leaveId: string }>({
      query: ({ id, leaveId }) => ({
        url: `/api/doctors/${id}/leaves/${leaveId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Doctor', 'Schedule'],
    }),
  }),
});

export const {
  useDoctorsQuery,
  useDoctorQuery,
  useCreateDoctorMutation,
  useUpdateDoctorMutation,
  useDeactivateDoctorMutation,
  useActivateDoctorMutation,
  usePutWorkingHoursMutation,
  useAddLeaveMutation,
  useDeleteLeaveMutation,
} = doctorsApi;
