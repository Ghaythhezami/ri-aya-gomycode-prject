import { CAPABILITY_GROUPS, pickLocalized, type Capability, type ProfileDto } from '@riaya/shared';

/** The name in the UI language, with the fallback chain of LocalizedText (ADR 0004 section 3). */
export function profileDisplayName(
  profile: Pick<ProfileDto, 'firstName' | 'lastName' | 'firstNameI18n' | 'lastNameI18n'>,
  locale: string | null | undefined,
): string {
  const first = pickLocalized(profile.firstNameI18n, locale, profile.firstName);
  const last = pickLocalized(profile.lastNameI18n, locale, profile.lastName);
  return [first, last].filter(Boolean).join(' ');
}

/** Capabilities grouped for display, in first-seen group order; unknown ones fall under workspace. */
export function groupCapabilities(
  capabilities: readonly string[],
): { group: string; items: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const capability of capabilities) {
    const group = CAPABILITY_GROUPS[capability as Capability] ?? 'workspace';
    groups.set(group, [...(groups.get(group) ?? []), capability]);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}
