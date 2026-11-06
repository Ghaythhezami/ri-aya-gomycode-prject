import { z } from 'zod';

/** Appointment codes look like AP-1042; the dash is optional when typing. */
export const selfCheckInSchema = z.object({
  appointmentCode: z
    .string()
    .trim()
    .min(1, 'display.errors.codeRequired')
    .transform((v) => v.toUpperCase().replace(/\s+/g, ''))
    .pipe(z.string().regex(/^[A-Z]{1,5}-?\d{1,8}$/, 'display.errors.codeFormat')),
  phoneLast4: z
    .string()
    .trim()
    .min(1, 'display.errors.phoneRequired')
    .regex(/^\d{4}$/, 'display.errors.phoneFormat'),
});

export type SelfCheckInFormInput = z.input<typeof selfCheckInSchema>;
export type SelfCheckInFormValues = z.output<typeof selfCheckInSchema>;

/** i18n key for a failed self check-in; deliberately generic for a wrong code or phone. */
export function selfCheckInErrorKey(status: number, code: string): string {
  if (status === 429) return 'display.checkIn.rateLimited';
  if (code === 'CHECK_IN_NOT_FOUND' || status === 404) return 'display.checkIn.notFound';
  if (code === 'ALREADY_CHECKED_IN') return 'display.checkIn.already';
  return 'display.checkIn.failed';
}
