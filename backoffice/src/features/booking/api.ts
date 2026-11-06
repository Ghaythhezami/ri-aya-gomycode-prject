import type {
  AppointmentDetail,
  CreateAppointmentInput,
  CreatePatientInput,
  DoctorCard,
  Paginated,
  PatientDetail,
  PatientListItem,
  SlotDto,
  SlotLock,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

/** Tags a new appointment makes stale: lists, calendar, dashboard, scheduling, queue. */
const AFFECTED = ['Appointment', 'Dashboard', 'Schedule', 'Queue', 'Patient', 'Doctor'] as const;

export const bookingApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    bookPatients: build.query<Paginated<PatientListItem>, { search: string }>({
      query: ({ search }) => ({
        url: '/api/patients',
        params: { search: search || undefined, limit: 6 },
      }),
      providesTags: ['Patient'],
    }),
    bookPatient: build.query<PatientDetail, string>({
      query: (id) => ({ url: `/api/patients/${id}` }),
      providesTags: ['Patient'],
    }),
    bookCreatePatient: build.mutation<PatientDetail, CreatePatientInput>({
      query: (body) => ({ url: '/api/patients', method: 'POST', body }),
      invalidatesTags: ['Patient'],
    }),
    bookSpecialties: build.query<string[], void>({
      query: () => ({ url: '/api/specialties' }),
      providesTags: ['Reference'],
    }),
    bookDoctors: build.query<DoctorCard[], { date: string; specialty?: string }>({
      query: ({ date, specialty }) => ({
        url: '/api/doctors',
        params: { date, specialty: specialty || undefined },
      }),
      providesTags: ['Doctor'],
    }),
    bookDoctor: build.query<DoctorCard, string>({
      query: (id) => ({ url: `/api/doctors/${id}` }),
      providesTags: ['Doctor'],
    }),
    bookSlots: build.query<SlotDto[], { doctorId: string; date: string; durationMinutes: number }>({
      query: ({ doctorId, ...params }) => ({ url: `/api/doctors/${doctorId}/slots`, params }),
      providesTags: ['Schedule', 'Appointment'],
    }),
    bookLock: build.mutation<
      SlotLock,
      { doctorId: string; startsAt: string; durationMinutes: number }
    >({
      query: (body) => ({ url: '/api/appointments/locks', method: 'POST', body }),
    }),
    bookUnlock: build.mutation<{ success: true }, string>({
      query: (token) => ({ url: `/api/appointments/locks/${token}`, method: 'DELETE' }),
    }),
    bookCreate: build.mutation<AppointmentDetail, CreateAppointmentInput>({
      query: (body) => ({ url: '/api/appointments', method: 'POST', body }),
      invalidatesTags: [...AFFECTED],
    }),
  }),
});

export const {
  useBookPatientsQuery,
  useBookPatientQuery,
  useBookCreatePatientMutation,
  useBookSpecialtiesQuery,
  useBookDoctorsQuery,
  useBookDoctorQuery,
  useBookSlotsQuery,
  useBookLockMutation,
  useBookUnlockMutation,
  useBookCreateMutation,
} = bookingApi;
