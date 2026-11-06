import { groupCapabilities, profileDisplayName } from './display';

const profile = {
  firstName: 'Amina',
  lastName: 'Ben',
  firstNameI18n: { en: 'Amina', ar: 'أمينة' },
  lastNameI18n: { en: 'Ben', fr: 'Benali' },
};

describe('profile display name (pickLocalized)', () => {
  it('uses the UI language when filled', () => {
    expect(profileDisplayName(profile, 'ar')).toBe('أمينة Ben');
    expect(profileDisplayName(profile, 'fr')).toBe('Amina Benali');
  });

  it('falls back to the canonical name when nothing is localized', () => {
    const plain = { firstName: 'Sam', lastName: 'Lee', firstNameI18n: {}, lastNameI18n: {} };
    expect(profileDisplayName(plain, 'ar')).toBe('Sam Lee');
  });
});

describe('capability groups', () => {
  it('groups by the shared matrix', () => {
    const groups = groupCapabilities(['viewPatients', 'manageSettings', 'readClinicalNotes']);
    expect(groups).toEqual([
      { group: 'patients', items: ['viewPatients', 'readClinicalNotes'] },
      { group: 'administration', items: ['manageSettings'] },
    ]);
  });
});
