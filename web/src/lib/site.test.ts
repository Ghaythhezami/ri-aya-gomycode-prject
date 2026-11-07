import { portalUrl } from './site';

describe('portalUrl', () => {
  it('points at the portal register and login pages of the workspace', () => {
    expect(portalUrl('register', 'https://app.example.com')).toBe(
      'https://app.example.com/portal/register',
    );
    expect(portalUrl('login', 'https://app.example.com/')).toBe(
      'https://app.example.com/portal/login',
    );
  });
});
