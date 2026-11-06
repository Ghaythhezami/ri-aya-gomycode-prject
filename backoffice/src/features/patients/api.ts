import type {
  AppointmentListItem,
  CreatePatientInput,
  DuplicateCheckResult,
  Paginated,
  PatientDetail,
  PatientListItem,
  UpdatePatientInput,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export interface PatientListParams {
  search?: string;
  status?: string;
  gender?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface DuplicateParams {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phone?: string;
}

export interface PatientAppointments {
  upcoming: AppointmentListItem[];
  past: AppointmentListItem[];
}

export const patientsApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    patients: build.query<Paginated<PatientListItem>, PatientListParams>({
      query: (params) => ({ url: '/api/patients', params: { ...params } }),
      providesTags: ['Patient'],
    }),
    patientDuplicates: build.query<DuplicateCheckResult, DuplicateParams>({
      query: (params) => ({ url: '/api/patients/duplicates', params: { ...params } }),
    }),
    patient: build.query<PatientDetail, string>({
      query: (id) => ({ url: `/api/patients/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Patient', id }],
    }),
    patientAppointments: build.query<PatientAppointments, string>({
      query: (id) => ({ url: `/api/patients/${id}/appointments` }),
      providesTags: (_r, _e, id) => [{ type: 'Patient', id }, 'Appointment'],
    }),
    createPatient: build.mutation<PatientDetail, CreatePatientInput>({
      query: (body) => ({ url: '/api/patients', method: 'POST', body }),
      invalidatesTags: ['Patient', 'Dashboard'],
    }),
    updatePatient: build.mutation<PatientDetail, { id: string; body: UpdatePatientInput }>({
      query: ({ id, body }) => ({ url: `/api/patients/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Patient', id }, 'Patient'],
    }),
    archivePatient: build.mutation<PatientDetail, string>({
      query: (id) => ({ url: `/api/patients/${id}/archive`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Patient', id }, 'Patient', 'Dashboard'],
    }),
  }),
});

export const {
  usePatientsQuery,
  usePatientDuplicatesQuery,
  usePatientQuery,
  usePatientAppointmentsQuery,
  useCreatePatientMutation,
  useUpdatePatientMutation,
  useArchivePatientMutation,
} = patientsApi;
