import type { OnboardingState, PermissionsMatrix } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export type OnboardingScope = 'user' | 'clinic';

export interface InviteTeamInput {
  email: string;
  clinicId: string;
  /** System role name or custom role key. */
  roleKey: string;
}

const onboardingApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    onboarding: build.query<OnboardingState, void>({
      query: () => ({ url: '/api/onboarding' }),
      providesTags: ['Onboarding'],
    }),
    completeOnboarding: build.mutation<unknown, { scope: OnboardingScope }>({
      query: (body) => ({ url: '/api/onboarding/complete', method: 'POST', body }),
      invalidatesTags: ['Onboarding'],
    }),
    /** Custom roles are optional: the wizard falls back to the four system roles on failure. */
    onboardingRoles: build.query<PermissionsMatrix, void>({
      query: () => ({ url: '/api/roles' }),
    }),
    inviteTeamMember: build.mutation<unknown, InviteTeamInput>({
      query: (body) => ({ url: '/api/invitations', method: 'POST', body }),
      invalidatesTags: ['Onboarding'],
    }),
  }),
});

export const {
  useOnboardingQuery,
  useCompleteOnboardingMutation,
  useOnboardingRolesQuery,
  useInviteTeamMemberMutation,
} = onboardingApi;
