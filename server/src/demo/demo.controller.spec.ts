import { secretMatches } from './demo.controller';

describe('secretMatches', () => {
  it('accepts only the exact secret', () => {
    expect(secretMatches('s3cret-value', 's3cret-value')).toBe(true);
    expect(secretMatches('s3cret-valuE', 's3cret-value')).toBe(false);
    expect(secretMatches('short', 's3cret-value')).toBe(false);
    expect(secretMatches(undefined, 's3cret-value')).toBe(false);
  });
});
