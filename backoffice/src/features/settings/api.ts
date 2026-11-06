import type {
  AuditDto,
  ClinicSettingsDto,
  CursorPage,
  RoleSummary,
  UpdateSettingsInput,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export interface AuditArgs {
  entity?: string;
  actorId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

const settingsApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    settings: build.query<ClinicSettingsDto, void>({
      query: () => ({ url: '/api/settings' }),
      providesTags: ['Settings'],
    }),
    updateSettings: build.mutation<ClinicSettingsDto, UpdateSettingsInput>({
      query: (body) => ({ url: '/api/settings', method: 'PUT', body }),
      // Settings feed the reference data (durations, slot size), the dashboard targets and the audit trail.
      invalidatesTags: ['Settings', 'Reference', 'Dashboard', 'Audit'],
    }),
    settingsRoles: build.query<RoleSummary[], void>({
      query: () => ({ url: '/api/settings/roles' }),
      providesTags: ['Settings'],
    }),
    auditLog: build.query<CursorPage<AuditDto>, AuditArgs>({
      query: ({ entity, actorId, from, to, cursor, limit = 25 }) => ({
        url: '/api/audit',
        params: {
          ...(entity ? { entity } : {}),
          ...(actorId ? { actorId } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(cursor ? { cursor } : {}),
          limit,
        },
      }),
      providesTags: ['Audit'],
    }),
  }),
});

export const {
  useSettingsQuery,
  useUpdateSettingsMutation,
  useSettingsRolesQuery,
  useAuditLogQuery,
  useLazyAuditLogQuery,
} = settingsApi;
