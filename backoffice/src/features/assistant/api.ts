import type { AssistantStatus } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export const assistantApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    assistantStatus: build.query<AssistantStatus, void>({
      query: () => ({ url: '/api/assistant/status' }),
    }),
  }),
});

export const { useAssistantStatusQuery } = assistantApi;
