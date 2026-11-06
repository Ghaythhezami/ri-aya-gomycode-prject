import { duplicateMatches, duplicateQuery } from './duplicates';

describe('duplicateQuery', () => {
  it('returns null until there is enough to compare', () => {
    expect(duplicateQuery({})).toBeNull();
    expect(duplicateQuery({ firstName: 'Sa', lastName: 'Jo' })).toBeNull();
    expect(duplicateQuery({ phone: '123' })).toBeNull();
  });

  it('queries by name and date of birth once all three are typed', () => {
    expect(
      duplicateQuery({ firstName: ' Sarah ', lastName: 'Johnson', dateOfBirth: '1990-04-02' }),
    ).toEqual({ firstName: 'Sarah', lastName: 'Johnson', dateOfBirth: '1990-04-02' });
  });

  it('queries by phone with at least 6 digits', () => {
    expect(duplicateQuery({ phone: '+971 50 123 1447' })).toEqual({ phone: '+971 50 123 1447' });
  });

  it('combines both when available', () => {
    const q = duplicateQuery({
      firstName: 'Sarah',
      lastName: 'Johnson',
      dateOfBirth: '1990-04-02',
      phone: '0501231447',
    });
    expect(q).toMatchObject({ firstName: 'Sarah', phone: '0501231447' });
  });

  it('ignores an incomplete date of birth', () => {
    expect(
      duplicateQuery({ firstName: 'Sarah', lastName: 'Johnson', dateOfBirth: '1990-04' }),
    ).toBeNull();
  });
});

describe('duplicateMatches', () => {
  it('reads matches from a DUPLICATE_PATIENT error only', () => {
    const matches = [{ id: 'p1' }];
    expect(duplicateMatches({ code: 'DUPLICATE_PATIENT', details: { matches } })).toEqual(matches);
    expect(duplicateMatches({ code: 'VALIDATION_FAILED', details: { matches } })).toEqual([]);
    expect(duplicateMatches({ code: 'DUPLICATE_PATIENT' })).toEqual([]);
    expect(duplicateMatches(null)).toEqual([]);
  });
});
