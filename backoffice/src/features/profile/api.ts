import type { ProfileDto, ProfileInput } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

const profileApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    profile: build.query<ProfileDto, void>({
      query: () => ({ url: '/api/profile' }),
      providesTags: ['Profile'],
    }),
    updateProfile: build.mutation<ProfileDto, ProfileInput>({
      query: (body) => ({ url: '/api/profile', method: 'PATCH', body }),
      invalidatesTags: ['Profile', 'Onboarding'],
    }),
    changePassword: build.mutation<unknown, ChangePasswordInput>({
      query: (body) => ({ url: '/api/auth/change-password', method: 'POST', body }),
    }),
  }),
});

export const { useProfileQuery, useUpdateProfileMutation, useChangePasswordMutation } = profileApi;
