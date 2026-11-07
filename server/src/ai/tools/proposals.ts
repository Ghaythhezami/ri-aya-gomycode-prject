import { z } from 'zod';
import { personName } from '../../common/mappers';
import { isEditable } from '../../appointments/appointment-state';
import { localDayBounds, toLocalDate } from '../../core/clinic-time';
import { preview } from '../proposal-preview';
import { idField, instantField, ToolError, type ToolActor, type ToolResult } from './tool-types';
import { parseInstant, type ToolDeps } from './tool-deps';

export const bookSchema = z.object({
  doctorId: idField,
  type: z.string().describe('Appointment type code from clinic_info / appointment types'),
  startsAt: instantField,
  reason: z.string().max(300).optional().describe('Short reason for the visit'),
});
export const staffBookSchema = bookSchema.extend({ patientId: idField });
export const rescheduleSchema = z.object({
  appointmentId: idField,
  startsAt: instantField,
  doctorId: idField.optional().describe('Only when the doctor changes'),
});
export const cancelSchema = z.object({
  appointmentId: idField,
  reason: z.string().max(300).optional(),
});
export const checkInSchema = z.object({ appointmentId: idField });

function ctxOf(actor: ToolActor) {
  return { locale: actor.locale, timeZone: actor.timezone };
}

/** Appointment of the caller's clinic (and, for patients, of the caller only), or a ToolError. */
async function loadAppointment(deps: ToolDeps, actor: ToolActor, id: string) {
  const row = await deps.prisma.appointment.findFirst({
    where: {
      id,
      clinicId: actor.clinicId,
      ...(actor.persona === 'patient' ? { patientId: actor.patientId } : {}),
    },
    include: {
      patient: {
        select: {
          id: true,
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
        },
      },
    },
  });
  if (!row) throw new ToolError('Appointment not found');
  return row;
}

async function assertPatientCanChange(deps: ToolDeps, actor: ToolActor, startsAt: Date) {
  if (actor.persona !== 'patient') return;
  const { cancellationNoticeHours } = await deps.settings.get(actor.clinicId);
  if (startsAt.getTime() - actor.now.getTime() < cancellationNoticeHours * 3600_000) {
    throw new ToolError(
      `Appointments can only be changed ${cancellationNoticeHours} hours or more before the start; ask the clinic.`,
    );
  }
}

function assertChangeable(status: string, actor: ToolActor) {
  const ok =
    actor.persona === 'patient'
      ? status === 'SCHEDULED' || status === 'CONFIRMED'
      : isEditable(status as never);
  if (!ok) throw new ToolError(`An appointment with status ${status} cannot be changed`);
}

export async function proposeBooking(
  deps: ToolDeps,
  actor: ToolActor,
  input: z.infer<typeof bookSchema> & { patientId?: string },
): Promise<ToolResult> {
  const patientId = actor.persona === 'patient' ? actor.patientId : input.patientId;
  if (!patientId) throw new ToolError('patientId is required');
  const patient = await deps.prisma.patient.findFirst({
    where: { id: patientId, clinicId: actor.clinicId, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, firstNameI18n: true, lastNameI18n: true },
  });
  if (!patient) throw new ToolError('Patient not found');
  const types = await deps.data.appointmentTypes(actor.clinicId, actor.locale);
  const type = types.find((t) => t.code === input.type);
  if (!type)
    throw new ToolError(
      `Unknown appointment type; use one of: ${types.map((t) => t.code).join(', ')}`,
    );
  if (actor.persona === 'patient' && type.isEmergency) {
    throw new ToolError(
      'Emergency visits cannot be booked online; call the clinic or the local emergency number',
    );
  }
  const startsAt = parseInstant(input.startsAt);
  const { free, doctorName: docName } = await deps.data.isSlotFree(actor.clinicId, {
    doctorId: input.doctorId,
    startsAt,
    durationMinutes: type.durationMinutes,
    now: actor.now,
  });
  if (!docName) throw new ToolError('Doctor not found or not active');
  if (!free)
    throw new ToolError('That slot is not available; call find_slots and pick a returned time');
  const text = preview.book({
    ...ctxOf(actor),
    patient: actor.persona === 'patient' ? undefined : personName(patient),
    doctor: docName,
    startsAt,
    reason: input.reason,
  });
  return {
    data: { status: 'proposal_shown_to_user', preview: text },
    proposal: {
      action: 'book_appointment',
      preview: text,
      params: {
        ...(actor.persona === 'patient' ? {} : { patientId }),
        doctorId: input.doctorId,
        type: input.type,
        startsAt: startsAt.toISOString(),
        ...(input.reason ? { reason: input.reason } : {}),
      },
    },
  };
}

export async function proposeReschedule(
  deps: ToolDeps,
  actor: ToolActor,
  input: z.infer<typeof rescheduleSchema>,
): Promise<ToolResult> {
  const appt = await loadAppointment(deps, actor, input.appointmentId);
  assertChangeable(appt.status, actor);
  await assertPatientCanChange(deps, actor, appt.startsAt);
  const startsAt = parseInstant(input.startsAt);
  const doctorId = input.doctorId ?? appt.doctorId;
  const minutes = Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000);
  const { free } = await deps.data.isSlotFree(actor.clinicId, {
    doctorId,
    startsAt,
    durationMinutes: minutes,
    now: actor.now,
    ignoreAppointmentId: appt.id,
  });
  if (!free)
    throw new ToolError('That slot is not available; call find_slots and pick a returned time');
  const text = preview.reschedule({ ...ctxOf(actor), code: appt.code, startsAt });
  return {
    data: { status: 'proposal_shown_to_user', preview: text },
    proposal: {
      action: 'reschedule_appointment',
      preview: text,
      params: {
        appointmentId: appt.id,
        startsAt: startsAt.toISOString(),
        ...(input.doctorId && input.doctorId !== appt.doctorId ? { doctorId: input.doctorId } : {}),
      },
    },
  };
}

export async function proposeCancel(
  deps: ToolDeps,
  actor: ToolActor,
  input: z.infer<typeof cancelSchema>,
): Promise<ToolResult> {
  const appt = await loadAppointment(deps, actor, input.appointmentId);
  assertChangeable(appt.status, actor);
  await assertPatientCanChange(deps, actor, appt.startsAt);
  const text = preview.cancel({ ...ctxOf(actor), code: appt.code });
  return {
    data: { status: 'proposal_shown_to_user', preview: text },
    proposal: {
      action: 'cancel_appointment',
      preview: text,
      params: { appointmentId: appt.id, ...(input.reason ? { reason: input.reason } : {}) },
    },
  };
}

export async function proposeCheckIn(
  deps: ToolDeps,
  actor: ToolActor,
  input: z.infer<typeof checkInSchema>,
): Promise<ToolResult> {
  const appt = await loadAppointment(deps, actor, input.appointmentId);
  if (appt.status !== 'SCHEDULED' && appt.status !== 'CONFIRMED') {
    throw new ToolError(`An appointment with status ${appt.status} cannot be checked in`);
  }
  const today = toLocalDate(actor.now, actor.timezone);
  const { start, end } = localDayBounds(today, actor.timezone);
  if (appt.startsAt < start || appt.startsAt >= end) {
    throw new ToolError('Only appointments of today can be checked in');
  }
  const text = preview.checkIn({
    ...ctxOf(actor),
    code: appt.code,
    patient: personName(appt.patient),
  });
  return {
    data: { status: 'proposal_shown_to_user', preview: text },
    proposal: { action: 'check_in', preview: text, params: { appointmentId: appt.id } },
  };
}
