import type { AppointmentListItem, Paginated, PatientListItem } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

const searchApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    globalSearchPatients: build.query<Paginated<PatientListItem>, string>({
      query: (search) => ({ url: '/api/patients', params: { search, limit: 5 } }),
      providesTags: ['Patient'],
    }),
    globalSearchAppointments: build.query<Paginated<AppointmentListItem>, string>({
      query: (search) => ({ url: '/api/appointments', params: { search, limit: 5 } }),
      providesTags: ['Appointment'],
    }),
  }),
});

export const { useGlobalSearchPatientsQuery, useGlobalSearchAppointmentsQuery } = searchApi;
