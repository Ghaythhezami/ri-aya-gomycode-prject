/**
 * Locale negotiation and the error-code catalogue shared by the API and apps.
 *
 * The server localises the human-readable `message` while keeping `code`
 * stable; clients may still map codes themselves. An unknown code has no entry
 * here and keeps the server's existing message (or the client's generic text).
 */

export const SUPPORTED_LOCALES = ['en', 'ar', 'fr'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const ERROR_MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    SLOT_CONFLICT: 'This time slot is no longer available',
    SLOT_LOCKED: 'Another user is booking this slot right now',
    OUTSIDE_WORKING_HOURS: 'The doctor is not available at this time',
    ILLEGAL_TRANSITION: 'This status change is not allowed',
    CANCEL_REASON_REQUIRED: 'A cancellation reason is required',
    CANCELLATION_POLICY: 'This cancellation is too late for the clinic policy; ask a clinic admin',
    DUPLICATE_PATIENT: 'A patient with the same name and date of birth or phone already exists',
    HOURS_CONFLICT: 'Existing bookings fall outside the new working hours',
    QUEUE_EMPTY: 'No patient is waiting',
    ALREADY_CHECKED_IN: 'This appointment is already checked in',
    STALE_PROPOSAL: 'The schedule changed since this proposal was generated; regenerate it',
    UNDO_EXPIRED: 'The undo window of 15 minutes has passed',
    CHECK_IN_NOT_FOUND: 'No appointment today matches these details',
    VALIDATION_FAILED: 'Validation failed',
    RATE_LIMITED: 'Too many requests, try again shortly',
    VALIDATION_ERROR: 'Validation failed',
    UNAUTHENTICATED: 'Session expired',
    TOKEN_REUSE: 'Session expired',
    NO_ACTIVE_MEMBERSHIP: 'You no longer have access to this clinic',
    FORBIDDEN: 'You do not have permission to perform this action',
    NO_MEMBERSHIP: 'You do not have access to that clinic',
    CONFLICT: 'The request conflicts with existing data',
    INTERNAL_ERROR: 'An unexpected error occurred',
    NOT_FOUND: 'Not found',
    CLINIC_NOT_FOUND: 'Clinic not found',
    MEMBERSHIP_NOT_FOUND: 'Membership not found',
    LAST_SUPER_ADMIN: 'An organization must keep at least one active super admin',
    EMAIL_TAKEN: 'An account with this email already exists',
    INVALID_INVITATION: 'This invitation is invalid or has expired',
    WEAK_PASSWORD: 'The password does not meet the security policy',
    INVALID_CREDENTIALS: 'Invalid credentials',
    ACCOUNT_LOCKED: 'Account temporarily locked. Try again in 15 minutes',
    INVALID_TOKEN: 'This link is invalid or has expired',
    SECURITY_STATE_UNAVAILABLE:
      'Security state is temporarily unavailable. Please try again shortly',
    SIGNUP_RETIRED: 'Self signup is retired. Create your organization with POST /api/auth/register',
    UNAUTHORIZED: 'Unauthorized',
  },
  ar: {
    SLOT_CONFLICT: 'هذا الموعد لم يعد متاحًا',
    SLOT_LOCKED: 'مستخدم آخر يحجز هذا الموعد الآن',
    OUTSIDE_WORKING_HOURS: 'الطبيب غير متاح في هذا الوقت',
    ILLEGAL_TRANSITION: 'تغيير الحالة هذا غير مسموح',
    CANCEL_REASON_REQUIRED: 'سبب الإلغاء مطلوب',
    CANCELLATION_POLICY: 'الإلغاء متأخر جدًا وفق سياسة العيادة؛ اطلب ذلك من مدير العيادة',
    DUPLICATE_PATIENT: 'يوجد مريض بنفس الاسم وتاريخ الميلاد أو رقم الهاتف',
    HOURS_CONFLICT: 'توجد حجوزات خارج ساعات العمل الجديدة',
    QUEUE_EMPTY: 'لا يوجد مريض في الانتظار',
    ALREADY_CHECKED_IN: 'تم تسجيل وصول هذا الموعد بالفعل',
    STALE_PROPOSAL: 'تغيّر الجدول منذ إنشاء هذا الاقتراح؛ أعد إنشاءه',
    UNDO_EXPIRED: 'انقضت مهلة التراجع البالغة 15 دقيقة',
    CHECK_IN_NOT_FOUND: 'لا يوجد موعد اليوم يطابق هذه البيانات',
    VALIDATION_FAILED: 'فشل التحقق من البيانات',
    RATE_LIMITED: 'طلبات كثيرة جدًا، حاول بعد قليل',
    VALIDATION_ERROR: 'فشل التحقق من البيانات',
    UNAUTHENTICATED: 'انتهت الجلسة',
    TOKEN_REUSE: 'انتهت الجلسة',
    NO_ACTIVE_MEMBERSHIP: 'لم تعد تملك صلاحية الوصول إلى هذه العيادة',
    FORBIDDEN: 'ليست لديك صلاحية لتنفيذ هذا الإجراء',
    NO_MEMBERSHIP: 'ليست لديك صلاحية الوصول إلى تلك العيادة',
    CONFLICT: 'يتعارض الطلب مع بيانات موجودة',
    INTERNAL_ERROR: 'حدث خطأ غير متوقع',
    NOT_FOUND: 'غير موجود',
    CLINIC_NOT_FOUND: 'العيادة غير موجودة',
    MEMBERSHIP_NOT_FOUND: 'العضوية غير موجودة',
    LAST_SUPER_ADMIN: 'يجب أن تحتفظ المؤسسة بمسؤول أعلى نشط واحد على الأقل',
    EMAIL_TAKEN: 'يوجد حساب بهذا البريد الإلكتروني بالفعل',
    INVALID_INVITATION: 'هذه الدعوة غير صالحة أو منتهية الصلاحية',
    WEAK_PASSWORD: 'كلمة المرور لا تستوفي سياسة الأمان',
    INVALID_CREDENTIALS: 'بيانات الدخول غير صحيحة',
    ACCOUNT_LOCKED: 'الحساب مقفل مؤقتًا، حاول بعد 15 دقيقة',
    INVALID_TOKEN: 'هذا الرابط غير صالح أو منتهي الصلاحية',
    SECURITY_STATE_UNAVAILABLE: 'حالة الأمان غير متاحة مؤقتًا، حاول بعد قليل',
    SIGNUP_RETIRED: 'التسجيل الذاتي متوقف، أنشئ مؤسستك بدلًا من ذلك',
    UNAUTHORIZED: 'غير مصرح',
  },
  fr: {
    SLOT_CONFLICT: "Ce créneau n'est plus disponible",
    SLOT_LOCKED: 'Un autre utilisateur réserve ce créneau en ce moment',
    OUTSIDE_WORKING_HOURS: "Le médecin n'est pas disponible à cette heure",
    ILLEGAL_TRANSITION: "Ce changement de statut n'est pas autorisé",
    CANCEL_REASON_REQUIRED: "Un motif d'annulation est requis",
    CANCELLATION_POLICY:
      'Annulation trop tardive selon la politique de la clinique ; demandez à un administrateur',
    DUPLICATE_PATIENT:
      'Un patient avec le même nom et la même date de naissance ou le même téléphone existe déjà',
    HOURS_CONFLICT: 'Des rendez-vous existants sortent des nouveaux horaires',
    QUEUE_EMPTY: "Aucun patient n'attend",
    ALREADY_CHECKED_IN: "L'arrivée de ce rendez-vous est déjà enregistrée",
    STALE_PROPOSAL: 'Le planning a changé depuis cette proposition ; régénérez-la',
    UNDO_EXPIRED: "Le délai d'annulation de 15 minutes est dépassé",
    CHECK_IN_NOT_FOUND: "Aucun rendez-vous aujourd'hui ne correspond à ces informations",
    VALIDATION_FAILED: 'Échec de la validation',
    RATE_LIMITED: 'Trop de requêtes, réessayez dans un instant',
    VALIDATION_ERROR: 'La validation a échoué',
    UNAUTHENTICATED: 'Session expirée',
    TOKEN_REUSE: 'Session expirée',
    NO_ACTIVE_MEMBERSHIP: "Vous n'avez plus accès à cette clinique",
    FORBIDDEN: "Vous n'avez pas la permission d'effectuer cette action",
    NO_MEMBERSHIP: "Vous n'avez pas accès à cette clinique",
    CONFLICT: 'La requête entre en conflit avec des données existantes',
    INTERNAL_ERROR: 'Une erreur inattendue est survenue',
    NOT_FOUND: 'Introuvable',
    CLINIC_NOT_FOUND: 'Clinique introuvable',
    MEMBERSHIP_NOT_FOUND: 'Adhésion introuvable',
    LAST_SUPER_ADMIN: 'Une organisation doit conserver au moins un super administrateur actif',
    EMAIL_TAKEN: 'Un compte avec cet e-mail existe déjà',
    INVALID_INVITATION: 'Cette invitation est invalide ou a expiré',
    WEAK_PASSWORD: 'Le mot de passe ne respecte pas la politique de sécurité',
    INVALID_CREDENTIALS: 'Identifiants invalides',
    ACCOUNT_LOCKED: 'Compte temporairement verrouillé, réessayez dans 15 minutes',
    INVALID_TOKEN: 'Ce lien est invalide ou a expiré',
    SECURITY_STATE_UNAVAILABLE:
      "L'état de sécurité est temporairement indisponible, réessayez dans un instant",
    SIGNUP_RETIRED: "L'inscription libre est supprimée, créez plutôt votre organisation",
    UNAUTHORIZED: 'Non autorisé',
  },
};

/**
 * Resolve `Accept-Language` to a supported locale.
 *
 * Q-values are honoured, and a regional tag resolves to its base language
 * (`ar-EG` → `ar`). No header, a malformed header or an unsupported language
 * falls back to English.
 */
export function negotiateLocale(header?: string | null): Locale {
  if (!header) return 'en';

  const preferences = header
    .split(',')
    .map((part, index) => {
      const [tagPart, ...params] = part.trim().split(';');
      const qParam = params.find((param) => param.trim().startsWith('q='));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return {
        tag: tagPart.trim().toLowerCase(),
        q: Number.isFinite(q) ? q : 0,
        index,
      };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of preferences) {
    const base = tag.split('-')[0];
    const match = SUPPORTED_LOCALES.find((locale) => locale === base);
    if (match) return match;
  }

  return 'en';
}

/** The localized message for a code, or null when the catalogue has no entry. */
export function errorMessage(code: string | null | undefined, locale: Locale): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[locale][code] ?? null;
}
