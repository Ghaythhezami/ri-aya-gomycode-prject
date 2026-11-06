/**
 * Localized invitation and password-reset templates (FR-040, NFR-017).
 *
 * Values are interpolated into an already-escaped template with `escapeHtml`,
 * never with `dangerouslySetInnerHTML` or raw interpolation: a clinic name or a
 * role is attacker-influenced text that lands in an email body (NFR-017, CON-517).
 */

export type SupportedLocale = 'en' | 'ar' | 'fr';

/** Arabic locales read right-to-left, so the invite body sets `dir="rtl"`. */
const RTL_LOCALES: readonly SupportedLocale[] = ['ar'];

/** Escape every HTML-significant character before a value reaches a template. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Strings {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  roleLabel: string;
  resetSubject: string;
  resetHeading: string;
  resetBody: string;
  resetCta: string;
}

const STRINGS: Record<SupportedLocale, Strings> = {
  en: {
    subject: "You're invited to join {clinic} on Ri'aya",
    heading: "You've been invited",
    body: 'You have been invited to join {clinic} as {role}. Accept the invitation to choose your password.',
    cta: 'Accept invitation',
    roleLabel: 'Role',
    resetSubject: "Reset your Ri'aya password",
    resetHeading: 'Reset your password',
    resetBody:
      'Use the button below to choose a new password. If you did not request this, ignore this email.',
    resetCta: 'Reset password',
  },
  ar: {
    subject: 'دعوة للانضمام إلى {clinic} على رِيّا',
    heading: 'تمت دعوتك',
    body: 'تمت دعوتك للانضمام إلى {clinic} بصفة {role}. اقبل الدعوة لاختيار كلمة المرور.',
    cta: 'قبول الدعوة',
    roleLabel: 'الدور',
    resetSubject: 'إعادة تعيين كلمة المرور لرِيّا',
    resetHeading: 'إعادة تعيين كلمة المرور',
    resetBody: 'استخدم الزر أدناه لاختيار كلمة مرور جديدة. إذا لم تطلب ذلك، تجاهل هذه الرسالة.',
    resetCta: 'إعادة تعيين كلمة المرور',
  },
  fr: {
    subject: "Vous êtes invité(e) à rejoindre {clinic} sur Ri'aya",
    heading: 'Vous avez été invité(e)',
    body: 'Vous avez été invité(e) à rejoindre {clinic} en tant que {role}. Acceptez l’invitation pour choisir votre mot de passe.',
    cta: "Accepter l'invitation",
    roleLabel: 'Rôle',
    resetSubject: "Réinitialisez votre mot de passe Ri'aya",
    resetHeading: 'Réinitialisez votre mot de passe',
    resetBody:
      'Utilisez le bouton ci-dessous pour choisir un nouveau mot de passe. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.',
    resetCta: 'Réinitialiser le mot de passe',
  },
};

function resolveLocale(locale?: string): SupportedLocale {
  return locale === 'ar' || locale === 'fr' ? locale : 'en';
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

/** Render the invitation email for one locale (FR-040, AC-047). */
export function renderInvitation(params: {
  clinicName: string;
  role: string;
  acceptUrl: string;
  locale?: string;
}): RenderedMail {
  const locale = resolveLocale(params.locale);
  const s = STRINGS[locale];
  const clinic = escapeHtml(params.clinicName);
  const role = escapeHtml(params.role);
  const url = escapeHtml(params.acceptUrl);
  const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';

  const subject = fill(s.subject, { clinic: params.clinicName });
  const body = fill(s.body, { clinic, role });
  const html =
    `<div dir="${dir}">` +
    `<h1>${s.heading}</h1>` +
    `<p>${body}</p>` +
    `<p>${s.roleLabel}: ${role}</p>` +
    `<p><a href="${url}">${s.cta}</a></p>` +
    `</div>`;
  const text = `${s.heading}\n\n${fill(s.body, { clinic: params.clinicName, role: params.role })}\n\n${params.acceptUrl}`;
  return { subject, html, text };
}

/** Render the password-reset email for one locale (FR-040, NFR-017). */
export function renderPasswordReset(params: { resetUrl: string; locale?: string }): RenderedMail {
  const locale = resolveLocale(params.locale);
  const s = STRINGS[locale];
  const url = escapeHtml(params.resetUrl);
  const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';

  const html =
    `<div dir="${dir}">` +
    `<h1>${s.resetHeading}</h1>` +
    `<p>${s.resetBody}</p>` +
    `<p><a href="${url}">${s.resetCta}</a></p>` +
    `</div>`;
  const text = `${s.resetHeading}\n\n${s.resetBody}\n\n${params.resetUrl}`;
  return { subject: s.resetSubject, html, text };
}
