import type { AppointmentEmailKind, MailLocale } from './mail.service';

/** A rendered e-mail. Every interpolated value is HTML-escaped (NFR-005). */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) links are rendered as buttons; anything else is dropped. */
function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

type Vars = Record<string, string>;

function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

interface Copy {
  subject: string;
  heading: string;
  lines: string[];
  cta?: string;
  footnote?: string;
}

const FOOTER: Record<MailLocale, string> = {
  en: "Sent by RI'AYA on behalf of {clinic}. If you did not expect this e-mail, you can ignore it.",
  fr: "Envoyé par RI'AYA pour {clinic}. Si vous n'attendiez pas ce message, vous pouvez l'ignorer.",
  ar: "أُرسلت من RI'AYA نيابةً عن {clinic}. إذا لم تكن تتوقع هذه الرسالة فيمكنك تجاهلها.",
};

const PASSWORD_RESET: Record<MailLocale, Copy> = {
  en: {
    subject: "Reset your RI'AYA password",
    heading: 'Reset your password',
    lines: [
      'We received a request to reset the password of your {clinic} account.',
      'The link works once and expires in {minutes} minutes.',
    ],
    cta: 'Choose a new password',
    footnote: 'If you did not ask for this, ignore this e-mail: your password stays the same.',
  },
  fr: {
    subject: "Réinitialisez votre mot de passe RI'AYA",
    heading: 'Réinitialiser votre mot de passe',
    lines: [
      'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte {clinic}.',
      'Le lien est utilisable une fois et expire dans {minutes} minutes.',
    ],
    cta: 'Choisir un nouveau mot de passe',
    footnote:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe ne change pas.",
  },
  ar: {
    subject: "إعادة تعيين كلمة مرور RI'AYA",
    heading: 'إعادة تعيين كلمة المرور',
    lines: [
      'تلقّينا طلبًا لإعادة تعيين كلمة مرور حسابك في {clinic}.',
      'يعمل الرابط مرة واحدة وتنتهي صلاحيته خلال {minutes} دقيقة.',
    ],
    cta: 'اختر كلمة مرور جديدة',
    footnote: 'إذا لم تطلب ذلك فتجاهل هذه الرسالة، ولن تتغير كلمة مرورك.',
  },
};

const INVITATION: Record<MailLocale, Copy> = {
  en: {
    subject: "You are invited to {clinic} on RI'AYA",
    heading: 'Join {clinic}',
    lines: [
      "You have been invited to join {clinic} on RI'AYA as {role}.",
      'The invitation expires in 7 days.',
    ],
    cta: 'Accept the invitation',
  },
  fr: {
    subject: "Invitation à rejoindre {clinic} sur RI'AYA",
    heading: 'Rejoindre {clinic}',
    lines: [
      "Vous êtes invité(e) à rejoindre {clinic} sur RI'AYA en tant que {role}.",
      "L'invitation expire dans 7 jours.",
    ],
    cta: "Accepter l'invitation",
  },
  ar: {
    subject: "دعوة للانضمام إلى {clinic} على RI'AYA",
    heading: 'انضم إلى {clinic}',
    lines: [
      "تمت دعوتك للانضمام إلى {clinic} على RI'AYA بصفة {role}.",
      'تنتهي صلاحية الدعوة خلال 7 أيام.',
    ],
    cta: 'قبول الدعوة',
  },
};

const APPOINTMENT: Record<AppointmentEmailKind, Record<MailLocale, Copy>> = {
  confirmation: {
    en: {
      subject: 'Appointment confirmed: {when}',
      heading: 'Your appointment is booked',
      lines: [
        '{doctor} at {clinic}',
        '{when}',
        'Reference: {code}',
        'Please arrive 10 minutes early. To cancel or move it, use the patient portal or call the clinic.',
      ],
      cta: 'Manage my appointments',
    },
    fr: {
      subject: 'Rendez-vous confirmé : {when}',
      heading: 'Votre rendez-vous est réservé',
      lines: [
        '{doctor} à {clinic}',
        '{when}',
        'Référence : {code}',
        "Merci d'arriver 10 minutes en avance. Pour annuler ou déplacer, utilisez le portail patient ou appelez la clinique.",
      ],
      cta: 'Gérer mes rendez-vous',
    },
    ar: {
      subject: 'تم تأكيد الموعد: {when}',
      heading: 'تم حجز موعدك',
      lines: [
        '{doctor} في {clinic}',
        '{when}',
        'المرجع: {code}',
        'يرجى الحضور قبل 10 دقائق. للإلغاء أو التعديل استخدم بوابة المريض أو اتصل بالعيادة.',
      ],
      cta: 'إدارة مواعيدي',
    },
  },
  reminder: {
    en: {
      subject: 'Reminder: appointment {when}',
      heading: 'Appointment reminder',
      lines: [
        'You have an appointment with {doctor} at {clinic}.',
        '{when}',
        'Reference: {code}',
        'If you cannot come, please cancel so another patient can take the slot.',
      ],
      cta: 'View or cancel',
    },
    fr: {
      subject: 'Rappel : rendez-vous {when}',
      heading: 'Rappel de rendez-vous',
      lines: [
        'Vous avez rendez-vous avec {doctor} à {clinic}.',
        '{when}',
        'Référence : {code}',
        'Si vous ne pouvez pas venir, annulez pour libérer le créneau.',
      ],
      cta: 'Voir ou annuler',
    },
    ar: {
      subject: 'تذكير: موعد {when}',
      heading: 'تذكير بالموعد',
      lines: [
        'لديك موعد مع {doctor} في {clinic}.',
        '{when}',
        'المرجع: {code}',
        'إذا تعذّر حضورك فيرجى الإلغاء ليستفيد مريض آخر من الموعد.',
      ],
      cta: 'عرض أو إلغاء',
    },
  },
  cancelled: {
    en: {
      subject: 'Appointment cancelled: {when}',
      heading: 'Your appointment was cancelled',
      lines: [
        '{doctor} at {clinic}',
        '{when}',
        'Reference: {code}',
        'You can book a new time in the patient portal or by calling the clinic.',
      ],
      cta: 'Book a new time',
    },
    fr: {
      subject: 'Rendez-vous annulé : {when}',
      heading: 'Votre rendez-vous a été annulé',
      lines: [
        '{doctor} à {clinic}',
        '{when}',
        'Référence : {code}',
        'Vous pouvez reprendre un rendez-vous sur le portail patient ou en appelant la clinique.',
      ],
      cta: 'Reprendre rendez-vous',
    },
    ar: {
      subject: 'تم إلغاء الموعد: {when}',
      heading: 'تم إلغاء موعدك',
      lines: [
        '{doctor} في {clinic}',
        '{when}',
        'المرجع: {code}',
        'يمكنك حجز موعد جديد عبر بوابة المريض أو بالاتصال بالعيادة.',
      ],
      cta: 'حجز موعد جديد',
    },
  },
  rescheduled: {
    en: {
      subject: 'Appointment moved to {when}',
      heading: 'Your appointment has a new time',
      lines: ['{doctor} at {clinic}', 'New time: {when}', 'Reference: {code}'],
      cta: 'View my appointments',
    },
    fr: {
      subject: 'Rendez-vous déplacé au {when}',
      heading: 'Votre rendez-vous a un nouvel horaire',
      lines: ['{doctor} à {clinic}', 'Nouvel horaire : {when}', 'Référence : {code}'],
      cta: 'Voir mes rendez-vous',
    },
    ar: {
      subject: 'تم نقل الموعد إلى {when}',
      heading: 'لموعدك وقت جديد',
      lines: ['{doctor} في {clinic}', 'الوقت الجديد: {when}', 'المرجع: {code}'],
      cta: 'عرض مواعيدي',
    },
  },
};

function render(locale: MailLocale, copy: Copy, vars: Vars, url?: string): RenderedEmail {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const align = locale === 'ar' ? 'right' : 'left';
  const t = (s: string) => fill(s, vars);
  const link = safeUrl(url);
  const lines = copy.lines.map(t);
  const footer = fill(FOOTER[locale], vars);
  const htmlLines = lines
    .map(
      (l) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:#1f2a37">${escapeHtml(l)}</p>`,
    )
    .join('');
  const button =
    link && copy.cta
      ? `<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(t(copy.cta))}</a></p>` +
        `<p style="margin:0 0 12px;font-size:12px;line-height:18px;color:#6b7280;word-break:break-all">${escapeHtml(link)}</p>`
      : '';
  const note = copy.footnote
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(t(copy.footnote))}</p>`
    : '';
  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(t(copy.subject))}</title></head>
<body style="margin:0;padding:0;background:#f3f6f6;font-family:Segoe UI,Tahoma,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb" dir="${dir}">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;text-align:${align}"><span style="font-size:18px;font-weight:700;color:#0f766e">RI'AYA</span> <span style="font-size:14px;color:#6b7280">${escapeHtml(vars.clinic ?? '')}</span></td></tr>
<tr><td style="padding:24px;text-align:${align}">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:#111827">${escapeHtml(t(copy.heading))}</h1>
${htmlLines}${button}${note}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:18px;color:#6b7280;text-align:${align}">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    t(copy.heading),
    '',
    ...lines,
    ...(link && copy.cta ? ['', `${t(copy.cta)}: ${link}`] : []),
    ...(copy.footnote ? ['', t(copy.footnote)] : []),
    '',
    footer,
  ].join('\n');
  return { subject: t(copy.subject), html, text };
}

export function passwordResetEmail(p: {
  locale: MailLocale;
  clinicName: string;
  resetUrl: string;
  minutes: number;
}): RenderedEmail {
  return render(
    p.locale,
    PASSWORD_RESET[p.locale],
    { clinic: p.clinicName, minutes: String(p.minutes) },
    p.resetUrl,
  );
}

export function invitationEmail(p: {
  locale: MailLocale;
  clinicName: string;
  role: string;
  acceptUrl: string;
}): RenderedEmail {
  return render(
    p.locale,
    INVITATION[p.locale],
    { clinic: p.clinicName, role: p.role },
    p.acceptUrl,
  );
}

export function appointmentEmail(p: {
  locale: MailLocale;
  kind: AppointmentEmailKind;
  clinicName: string;
  doctorName: string;
  when: string;
  code: string;
  manageUrl?: string;
}): RenderedEmail {
  return render(
    p.locale,
    APPOINTMENT[p.kind][p.locale],
    { clinic: p.clinicName, doctor: p.doctorName, when: p.when, code: p.code },
    p.manageUrl,
  );
}

export function asMailLocale(value: string | null | undefined): MailLocale {
  const v = (value ?? '').slice(0, 2).toLowerCase();
  return v === 'ar' || v === 'fr' ? v : 'en';
}
