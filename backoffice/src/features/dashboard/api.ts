import type { DashboardDto } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export const dashboardApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    dashboard: build.query<DashboardDto, void>({
      query: () => ({ url: '/api/dashboard' }),
      providesTags: ['Dashboard'],
    }),
  }),
});

export const { useDashboardQuery } = dashboardApi;
