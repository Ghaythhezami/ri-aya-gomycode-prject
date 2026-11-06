import type { LocalizedText, UserRole } from '@riaya/shared';

/** Built-in names and descriptions of the four system roles (used until a clinic customises them). */
export const SYSTEM_ROLE_DEFAULTS: Record<
  UserRole,
  { name: LocalizedText; description: LocalizedText }
> = {
  SUPER_ADMIN: {
    name: { en: 'Super admin', fr: 'Super administrateur', ar: 'مدير عام' },
    description: {
      en: 'Owns the organization. Always has every capability.',
      fr: "Propriétaire de l'organisation. Dispose toujours de toutes les capacités.",
      ar: 'مالك المؤسسة. يملك جميع الصلاحيات دائماً.',
    },
  },
  CLINIC_ADMIN: {
    name: { en: 'Clinic admin', fr: 'Administrateur de la clinique', ar: 'مدير العيادة' },
    description: {
      en: 'Manages the clinic, its staff and settings.',
      fr: 'Gère la clinique, son personnel et ses paramètres.',
      ar: 'يدير العيادة وفريقها وإعداداتها.',
    },
  },
  DOCTOR: {
    name: { en: 'Doctor', fr: 'Médecin', ar: 'طبيب' },
    description: {
      en: 'Sees their own schedule and patients.',
      fr: 'Consulte son propre planning et ses patients.',
      ar: 'يطّلع على جدوله ومرضاه.',
    },
  },
  RECEPTIONIST: {
    name: { en: 'Receptionist', fr: 'Réceptionniste', ar: 'موظف استقبال' },
    description: {
      en: 'Books appointments and runs the waiting room.',
      fr: "Gère les rendez-vous et la salle d'attente.",
      ar: 'يحجز المواعيد ويدير غرفة الانتظار.',
    },
  },
};
