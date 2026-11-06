import type {
  AppointmentTypeDto,
  AppointmentTypeInput,
  AuditDto,
  ClinicSettingsDto,
  CursorPage,
  PermissionsMatrix,
  RoleDto,
  RoleInput,
  RoleSummary,
  UpdateSettingsInput,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

/** A member of the active clinic (`GET /api/memberships`). */
export interface StaffMemberDto {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  /** System role name or custom role slug. */
  roleKey: string;
  /** Role name in the request language. */
  roleName: string;
  status?: 'ACTIVE' | 'SUSPENDED';
}

export interface AssignRoleResult {
  membershipId: string;
  roleKey: string;
  role: string;
  roleId: string | null;
}

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
    roles: build.query<PermissionsMatrix, void>({
      query: () => ({ url: '/api/roles' }),
      providesTags: ['Settings'],
    }),
    createRole: build.mutation<RoleDto, RoleInput>({
      query: (body) => ({ url: '/api/roles', method: 'POST', body }),
      invalidatesTags: ['Settings', 'Audit'],
    }),
    updateRole: build.mutation<RoleDto, { key: string; body: Partial<RoleInput> }>({
      query: ({ key, body }) => ({
        url: `/api/roles/${encodeURIComponent(key)}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Settings', 'Audit'],
    }),
    deleteRole: build.mutation<{ success: true }, string>({
      query: (key) => ({ url: `/api/roles/${encodeURIComponent(key)}`, method: 'DELETE' }),
      invalidatesTags: ['Settings', 'Audit'],
    }),
    staffMembers: build.query<StaffMemberDto[], void>({
      query: () => ({ url: '/api/memberships' }),
      providesTags: ['Settings'],
    }),
    assignRole: build.mutation<
      AssignRoleResult,
      { membershipId: string; roleKey: string; roleName: string }
    >({
      query: ({ membershipId, roleKey }) => ({
        url: `/api/memberships/${encodeURIComponent(membershipId)}/role`,
        method: 'PATCH',
        body: { roleKey },
      }),
      // Optimistic: show the new role at once, roll back when the API refuses.
      async onQueryStarted({ membershipId, roleKey, roleName }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          settingsApi.util.updateQueryData('staffMembers', undefined, (draft) => {
            const member = draft.find((m) => m.membershipId === membershipId);
            if (member) {
              member.roleKey = roleKey;
              member.roleName = roleName;
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ['Settings', 'Audit'],
    }),
    appointmentTypes: build.query<AppointmentTypeDto[], void>({
      query: () => ({ url: '/api/appointment-types', params: { includeInactive: true } }),
      providesTags: ['Settings'],
    }),
    createAppointmentType: build.mutation<AppointmentTypeDto, AppointmentTypeInput>({
      query: (body) => ({ url: '/api/appointment-types', method: 'POST', body }),
      invalidatesTags: ['Settings', 'Reference', 'Audit'],
    }),
    updateAppointmentType: build.mutation<
      AppointmentTypeDto,
      { id: string; body: Partial<AppointmentTypeInput> }
    >({
      query: ({ id, body }) => ({
        url: `/api/appointment-types/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Settings', 'Reference', 'Audit'],
    }),
    deleteAppointmentType: build.mutation<{ success: true }, string>({
      query: (id) => ({
        url: `/api/appointment-types/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Settings', 'Reference', 'Audit'],
    }),
    reorderAppointmentTypes: build.mutation<null, { id: string; sortOrder: number }[]>({
      async queryFn(changes, _api, _extra, baseQuery) {
        for (const { id, sortOrder } of changes) {
          const result = await baseQuery({
            url: `/api/appointment-types/${encodeURIComponent(id)}`,
            method: 'PATCH',
            body: { sortOrder },
          });
          if (result.error) return { error: result.error };
        }
        return { data: null };
      },
      async onQueryStarted(changes, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          settingsApi.util.updateQueryData('appointmentTypes', undefined, (draft) => {
            for (const c of changes) {
              const item = draft.find((t) => t.id === c.id);
              if (item) item.sortOrder = c.sortOrder;
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ['Settings', 'Reference'],
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
  useRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useStaffMembersQuery,
  useAssignRoleMutation,
  useAppointmentTypesQuery,
  useCreateAppointmentTypeMutation,
  useUpdateAppointmentTypeMutation,
  useDeleteAppointmentTypeMutation,
  useReorderAppointmentTypesMutation,
  useAuditLogQuery,
  useLazyAuditLogQuery,
} = settingsApi;
