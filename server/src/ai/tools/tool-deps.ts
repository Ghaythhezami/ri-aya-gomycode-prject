import type { Prisma } from '@prisma/client';
import { personName, doctorName } from '../../common/mappers';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { QueueService } from '../../queue/queue.service';
import { SchedulingService } from '../../scheduling/scheduling.service';
import { InsightsService } from '../../analytics/insights.service';
import { ClinicSettingsReader } from '../../core/clinic-settings.reader';
import { AiDataService } from '../ai-data.service';
import { toLocalIso } from '../ai-format';
import { ToolError } from './tool-types';

/** Services the tools call. Insights is optional: it exists only where the scheduler runs. */
export interface ToolDeps {
  prisma: PrismaService;
  data: AiDataService;
  settings: ClinicSettingsReader;
  queue: QueueService;
  notifications: NotificationsService;
  scheduling: SchedulingService;
  insights: () => InsightsService | null;
}

export const APPT_INCLUDE = {
  patient: {
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true,
      firstNameI18n: true,
      lastNameI18n: true,
    },
  },
  doctor: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      firstNameI18n: true,
      lastNameI18n: true,
      specialty: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

export type ApptRow = Prisma.AppointmentGetPayload<{ include: typeof APPT_INCLUDE }>;

/** Compact appointment for the model: ids, names and local-zone ISO times, no notes. */
export function apptJson(row: ApptRow, timeZone: string, withPatient: boolean) {
  return {
    id: row.id,
    code: row.code,
    startsAt: toLocalIso(row.startsAt, timeZone),
    endsAt: toLocalIso(row.endsAt, timeZone),
    status: row.status,
    type: row.type,
    reason: row.reason,
    doctorId: row.doctor.id,
    doctor: doctorName(row.doctor),
    specialty: row.doctor.specialty,
    ...(withPatient
      ? {
          patientId: row.patient.id,
          patient: personName(row.patient),
          patientCode: row.patient.code,
        }
      : {}),
    needsReschedule: row.needsReschedule,
  };
}

export function parseInstant(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ToolError('startsAt is not a valid date-time');
  return d;
}
