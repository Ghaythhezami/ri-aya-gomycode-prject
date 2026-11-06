import type { ClinicReference } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export const referenceApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    clinicReference: build.query<ClinicReference, void>({
      query: () => ({ url: '/api/clinic/reference' }),
      providesTags: ['Reference'],
    }),
  }),
});

export const { useClinicReferenceQuery } = referenceApi;
