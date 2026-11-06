import type { PublicDisplay, SelfCheckInInput, SelfCheckInResult } from '@riaya/shared';
import { api } from '../../lib/api';
import { clinicApi } from '../../store/clinicApi';

/** Public waiting-room feed: plain request, no auth, numbers and rooms only. */
export async function fetchPublicDisplay(clinicId: string, signal?: AbortSignal) {
  const { data } = await api.get<PublicDisplay>(`/api/public/display/${clinicId}`, { signal });
  return data;
}

export const displayApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    selfCheckIn: build.mutation<SelfCheckInResult, { clinicId: string; body: SelfCheckInInput }>({
      query: ({ clinicId, body }) => ({
        url: `/api/public/check-in/${clinicId}`,
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const { useSelfCheckInMutation } = displayApi;
