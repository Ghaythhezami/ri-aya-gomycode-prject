import {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  LOCKED_ADMIN_CAPABILITIES,
  type Capability,
  type CapabilityGroup,
  type RoleDto,
} from '@riaya/shared';

/** Display order of the permission groups (the capability list itself is the shared closed list). */
export const GROUP_ORDER: readonly CapabilityGroup[] = [
  'workspace',
  'communication',
  'appointments',
  'patients',
  'doctors',
  'scheduling',
  'analytics',
  'administration',
];

/** Key of the system role that always keeps the locked admin capabilities. */
export const LOCKED_ROLE_KEY = 'CLINIC_ADMIN';

/** Why a matrix cell cannot be changed; null means the box is a normal toggle. */
export type CellReason = 'readonly' | 'locked' | 'notHeld' | 'viewOnly' | null;

export interface CellState {
  checked: boolean;
  disabled: boolean;
  reason: CellReason;
}

/** Edited capability lists, keyed by role key. A role absent from the draft is unchanged. */
export type MatrixDraft = Record<string, Capability[]>;

const isCapability = (value: string): value is Capability =>
  (CAPABILITIES as readonly string[]).includes(value);

/** Capabilities in the canonical order, without duplicates or unknown entries. */
export function normalizeCapabilities(list: readonly string[]): Capability[] {
  const set = new Set(list.filter(isCapability));
  return CAPABILITIES.filter((c) => set.has(c));
}

export function isLockedFor(role: Pick<RoleDto, 'key'>, capability: Capability): boolean {
  return role.key === LOCKED_ROLE_KEY && LOCKED_ADMIN_CAPABILITIES.includes(capability);
}

/** Current (draft or saved) capabilities of a role. */
export function currentCapabilities(role: RoleDto, draft: MatrixDraft): Capability[] {
  return draft[role.key] ?? normalizeCapabilities(role.capabilities);
}

/**
 * State of one checkbox. Read-only roles and locked admin capabilities show checked and
 * disabled; a capability the signed-in user does not hold cannot be granted or revoked
 * (the API refuses escalation), so it is disabled with an explanation.
 */
export function cellState(
  role: RoleDto,
  capability: Capability,
  draft: MatrixDraft,
  userCapabilities: readonly string[],
): CellState {
  if (!role.editable) return { checked: true, disabled: true, reason: 'readonly' };
  if (isLockedFor(role, capability)) return { checked: true, disabled: true, reason: 'locked' };
  const checked = currentCapabilities(role, draft).includes(capability);
  if (!userCapabilities.includes(capability)) return { checked, disabled: true, reason: 'notHeld' };
  return { checked, disabled: false, reason: null };
}

/** Flip one capability for a role, never touching a disabled cell. Returns the next draft. */
export function toggleCapability(
  draft: MatrixDraft,
  role: RoleDto,
  capability: Capability,
  userCapabilities: readonly string[],
): MatrixDraft {
  if (cellState(role, capability, draft, userCapabilities).disabled) return draft;
  const current = currentCapabilities(role, draft);
  const next = current.includes(capability)
    ? current.filter((c) => c !== capability)
    : normalizeCapabilities([...current, capability]);
  return setRoleDraft(draft, role, next);
}

/** Store a role's list in the draft, or drop it when it equals the saved list. */
export function setRoleDraft(draft: MatrixDraft, role: RoleDto, next: Capability[]): MatrixDraft {
  const out = { ...draft };
  if (sameCapabilities(next, role.capabilities)) delete out[role.key];
  else out[role.key] = next;
  return out;
}

export function sameCapabilities(a: readonly string[], b: readonly string[]): boolean {
  const left = normalizeCapabilities(a);
  const right = normalizeCapabilities(b);
  return left.length === right.length && left.every((c, i) => c === right[i]);
}

export interface CapabilityDiff {
  added: Capability[];
  removed: Capability[];
}

export function diffCapabilities(role: RoleDto, draft: MatrixDraft): CapabilityDiff {
  const saved = new Set(normalizeCapabilities(role.capabilities));
  const now = new Set(currentCapabilities(role, draft));
  return {
    added: CAPABILITIES.filter((c) => now.has(c) && !saved.has(c)),
    removed: CAPABILITIES.filter((c) => saved.has(c) && !now.has(c)),
  };
}

export function isRoleDirty(role: RoleDto, draft: MatrixDraft): boolean {
  const diff = diffCapabilities(role, draft);
  return diff.added.length + diff.removed.length > 0;
}

/** Keys of the roles with unsaved changes, in the order of `roles`. */
export function dirtyRoleKeys(roles: readonly RoleDto[], draft: MatrixDraft): string[] {
  return roles.filter((r) => isRoleDirty(r, draft)).map((r) => r.key);
}

/** Rows of the matrix: capabilities grouped in display order, each group in canonical order. */
export function groupCapabilities(
  available: readonly { key: Capability; group: CapabilityGroup }[] | undefined,
): { group: CapabilityGroup; capabilities: Capability[] }[] {
  const keys = new Set(available?.map((c) => c.key) ?? CAPABILITIES);
  const groupOf = (c: Capability): CapabilityGroup =>
    available?.find((a) => a.key === c)?.group ?? CAPABILITY_GROUPS[c];
  return GROUP_ORDER.map((group) => ({
    group,
    capabilities: CAPABILITIES.filter((c) => keys.has(c) && groupOf(c) === group),
  })).filter((g) => g.capabilities.length > 0);
}

/**
 * "Start from a template": the capabilities of an existing role, limited to those the
 * signed-in user holds (the API rejects granting anything else).
 */
export function templateCapabilities(
  roles: readonly RoleDto[],
  templateKey: string,
  userCapabilities: readonly string[],
): { capabilities: Capability[]; dropped: number } {
  const source = normalizeCapabilities(
    roles.find((r) => r.key === templateKey)?.capabilities ?? [],
  );
  const capabilities = source.filter((c) => userCapabilities.includes(c));
  return { capabilities, dropped: source.length - capabilities.length };
}

/** A customised system role (it has a saved row) can be reset to its defaults. */
export function canReset(role: RoleDto): boolean {
  return role.isSystem && role.editable && role.id !== null;
}

/** Custom role without members can be deleted. */
export function canDelete(role: RoleDto): boolean {
  return !role.isSystem && role.editable;
}
