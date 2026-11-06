import { LOCKED_ADMIN_CAPABILITIES, defaultCapabilities, type RoleDto } from '@riaya/shared';
import {
  canDelete,
  canReset,
  cellState,
  diffCapabilities,
  dirtyRoleKeys,
  groupCapabilities,
  isRoleDirty,
  templateCapabilities,
  toggleCapability,
} from './rbac';
import {
  moveType,
  moveTypeTo,
  reorderChanges,
  typeFormSchema,
  typePayload,
  canDeactivate,
} from './appointmentTypes';
import type { AppointmentTypeDto } from '@riaya/shared';

const role = (key: string, over: Partial<RoleDto> = {}): RoleDto => ({
  id: null,
  key,
  name: { en: key },
  displayName: key,
  description: {},
  baseRole: key === 'CLINIC_ADMIN' ? 'CLINIC_ADMIN' : 'DOCTOR',
  capabilities: defaultCapabilities(key === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : key),
  isSystem: true,
  editable: key !== 'SUPER_ADMIN',
  memberCount: 0,
  ...over,
});
const doctor = role('DOCTOR');
const admin = role('CLINIC_ADMIN');
const all = ['viewAnalytics', 'viewOverview', 'manageStaff', 'manageRoles', 'manageSettings'];

describe('permissions matrix', () => {
  it('toggles, tracks dirt and diffs against the saved list', () => {
    expect(doctor.capabilities).toContain('viewAnalytics');
    let draft = toggleCapability({}, doctor, 'viewAnalytics', all);
    expect(isRoleDirty(doctor, draft)).toBe(true);
    expect(diffCapabilities(doctor, draft)).toEqual({ added: [], removed: ['viewAnalytics'] });
    expect(dirtyRoleKeys([doctor, admin], draft)).toEqual(['DOCTOR']);
    draft = toggleCapability(draft, doctor, 'viewAnalytics', all);
    expect(draft).toEqual({});
    expect(isRoleDirty(doctor, draft)).toBe(false);
  });

  it('shows SUPER_ADMIN read-only and locked admin capabilities checked and disabled', () => {
    const sa = role('SUPER_ADMIN');
    expect(cellState(sa, 'manageRoles', {}, all)).toEqual({
      checked: true,
      disabled: true,
      reason: 'readonly',
    });
    for (const c of LOCKED_ADMIN_CAPABILITIES) {
      expect(cellState(admin, c, {}, all)).toMatchObject({
        checked: true,
        disabled: true,
        reason: 'locked',
      });
    }
    expect(toggleCapability({}, admin, 'manageRoles', all)).toEqual({});
  });

  it('disables capabilities the user does not hold', () => {
    const state = cellState(doctor, 'manageStaff', {}, ['viewAnalytics']);
    expect(state).toMatchObject({ disabled: true, reason: 'notHeld', checked: false });
    expect(toggleCapability({}, doctor, 'manageStaff', ['viewAnalytics'])).toEqual({});
  });

  it('groups all 22 capabilities and limits templates to held ones', () => {
    const groups = groupCapabilities(undefined);
    expect(groups).toHaveLength(8);
    expect(groups.flatMap((g) => g.capabilities)).toHaveLength(22);
    const tpl = templateCapabilities([admin], 'CLINIC_ADMIN', ['viewOverview', 'manageStaff']);
    expect(tpl.capabilities).toEqual(['viewOverview', 'manageStaff']);
    expect(tpl.dropped).toBe(admin.capabilities.length - 2);
  });

  it('resets customised system roles and deletes custom ones only', () => {
    expect(canReset(doctor)).toBe(false);
    expect(canReset({ ...doctor, id: 'r1' })).toBe(true);
    expect(canDelete(doctor)).toBe(false);
    expect(canDelete({ ...doctor, isSystem: false })).toBe(true);
  });
});

const type = (
  id: string,
  sortOrder: number,
  over: Partial<AppointmentTypeDto> = {},
): AppointmentTypeDto => ({
  id,
  code: id.toUpperCase(),
  name: { en: id },
  displayName: id,
  durationMinutes: 30,
  color: 'primary',
  isEmergency: false,
  isActive: true,
  isSystem: false,
  sortOrder,
  usageCount: 0,
  ...over,
});

describe('appointment types', () => {
  it('validates the form', () => {
    const ok = {
      name: { en: 'Scan' },
      durationMinutes: 45,
      color: 'info',
      isEmergency: false,
      isActive: true,
    };
    expect(typeFormSchema.safeParse(ok).success).toBe(true);
    const msgs = (v: object) =>
      typeFormSchema.safeParse(v).error?.issues.map((i) => i.message) ?? [];
    expect(msgs({ ...ok, name: { en: '  ' } })).toContain('settings.errors.nameRequired');
    expect(msgs({ ...ok, durationMinutes: 3 })).toContain('settings.errors.min5');
    expect(msgs({ ...ok, durationMinutes: 500 })).toContain('settings.errors.max480');
    expect(msgs({ ...ok, durationMinutes: 42 })).toContain('settings.errors.step5');
    expect(typeFormSchema.safeParse({ ...ok, color: 'pink' }).success).toBe(false);
  });

  it('sends only changed fields and never the emergency flag of a system type', () => {
    const sys = type('a', 0, { isSystem: true, isEmergency: true });
    const values = {
      name: { en: 'a' },
      durationMinutes: 40,
      color: 'primary' as const,
      isEmergency: false,
      isActive: true,
    };
    expect(typePayload(values, sys)).toEqual({ durationMinutes: 40 });
  });

  it('reorders and reports only changed sortOrders', () => {
    const list = [type('a', 0), type('b', 1), type('c', 2)];
    const down = moveType(list, 'a', 1);
    expect(down.map((t) => t.id)).toEqual(['b', 'a', 'c']);
    expect(reorderChanges(list, down)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
    expect(moveType(list, 'a', -1).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(moveTypeTo(list, 'c', 'a').map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps one active non-emergency type', () => {
    const only = type('a', 0);
    const em = type('e', 1, { isEmergency: true });
    expect(canDeactivate([only, em], only)).toBe(false);
    expect(canDeactivate([only, em], em)).toBe(true);
    expect(canDeactivate([only, type('b', 2), em], only)).toBe(true);
  });
});
