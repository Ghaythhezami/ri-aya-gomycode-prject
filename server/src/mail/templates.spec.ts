import { escapeHtml, renderInvitation } from './templates';

const ACCEPT_URL =
  'https://app.riaya.test/accept-invite?token=abc123&organizationId=org-1&clinicId=clinic-1&role=DOCTOR';

describe('Invitation email templates (AC-047)', () => {
  it('AC-047: renders localized EN/AR/FR templates with clinic, role and accept link', () => {
    const clinicName = 'Bright <Clinic> & Co';

    const en = renderInvitation({
      clinicName,
      role: 'DOCTOR',
      acceptUrl: ACCEPT_URL,
      locale: 'en',
    });
    expect(en.subject).toContain(clinicName);
    expect(en.html).toContain('Bright &lt;Clinic&gt; &amp; Co');
    expect(en.html).toContain('DOCTOR');
    expect(en.html).toContain('Accept invitation');
    expect(en.html).toContain(ACCEPT_URL.replace(/&/g, '&amp;'));
    expect(en.text).toContain(ACCEPT_URL);
    expect(en.html).not.toContain(clinicName);

    const fr = renderInvitation({
      clinicName,
      role: 'DOCTOR',
      acceptUrl: ACCEPT_URL,
      locale: 'fr',
    });
    expect(fr.subject).toContain('rejoindre');
    expect(fr.html).toContain("Accepter l'invitation");
    expect(fr.html).toContain(ACCEPT_URL.replace(/&/g, '&amp;'));

    const ar = renderInvitation({
      clinicName,
      role: 'DOCTOR',
      acceptUrl: ACCEPT_URL,
      locale: 'ar',
    });
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).toContain(ACCEPT_URL.replace(/&/g, '&amp;'));
    expect(ar.html).toContain('DOCTOR');

    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });
});
