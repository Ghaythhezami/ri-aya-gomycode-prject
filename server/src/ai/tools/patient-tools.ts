import { z } from 'zod';
import { doctorName } from '../../common/mappers';
import { PATIENT_VISIBLE_DOCUMENTS } from '../../documents/patient-visibility';
import { toLocalIso } from '../ai-format';
import { APPT_INCLUDE, apptJson, type ToolDeps } from './tool-deps';
import {
  bookSchema,
  cancelSchema,
  proposeBooking,
  proposeCancel,
  proposeReschedule,
  rescheduleSchema,
} from './proposals';
import {
  dateField,
  defineTool,
  idField,
  ToolError,
  type AssistantTool,
  type ToolActor,
} from './tool-types';

/** The patient id of the portal principal; a patient tool never accepts one from the model. */
function ownPatientId(actor: ToolActor): string {
  if (!actor.patientId) throw new ToolError('Not available');
  return actor.patientId;
}

/** Patient-portal tools. Every query is scoped by the principal's clinic and patient. */
export function patientTools(deps: ToolDeps): AssistantTool[] {
  return [
    defineTool({
      name: 'my_appointments',
      description:
        'Your upcoming appointments and your most recent past ones, with whether they can still be changed.',
      schema: z.object({}),
      personas: ['patient'],
      run: async (_input, actor) => {
        const patientId = ownPatientId(actor);
        const tz = actor.timezone;
        const { cancellationNoticeHours } = await deps.settings.get(actor.clinicId);
        const [upcoming, past] = await Promise.all([
          deps.prisma.appointment.findMany({
            where: { clinicId: actor.clinicId, patientId, startsAt: { gte: actor.now } },
            include: APPT_INCLUDE,
            orderBy: { startsAt: 'asc' },
            take: 10,
          }),
          deps.prisma.appointment.findMany({
            where: { clinicId: actor.clinicId, patientId, startsAt: { lt: actor.now } },
            include: APPT_INCLUDE,
            orderBy: { startsAt: 'desc' },
            take: 5,
          }),
        ]);
        const canChange = (a: { status: string; startsAt: Date }) =>
          (a.status === 'SCHEDULED' || a.status === 'CONFIRMED') &&
          a.startsAt.getTime() - actor.now.getTime() >= cancellationNoticeHours * 3600_000;
        return {
          data: {
            timezone: tz,
            upcoming: upcoming.map((a) => ({ ...apptJson(a, tz, false), canChange: canChange(a) })),
            past: past.map((a) => apptJson(a, tz, false)),
          },
        };
      },
    }),
    defineTool({
      name: 'clinic_info',
      description:
        'The clinic: name, address, phone, opening hours, doctors and the appointment types you can book.',
      schema: z.object({}),
      personas: ['patient'],
      run: async (_input, actor) => {
        const settings = await deps.settings.get(actor.clinicId);
        const [doctors, types] = await Promise.all([
          deps.prisma.doctor.findMany({
            where: { clinicId: actor.clinicId, isActive: true },
            orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
            take: 30,
          }),
          deps.data.appointmentTypes(actor.clinicId, actor.locale),
        ]);
        return {
          data: {
            name: settings.clinic.name,
            address: settings.clinic.address,
            phone: settings.phone,
            email: settings.contactEmail,
            timezone: settings.clinic.timezone,
            openingHours: settings.openingHours.map((d) => ({
              weekday: d.weekday,
              closed: d.closed,
              opens: d.closed
                ? null
                : `${String(Math.floor(d.open / 60)).padStart(2, '0')}:${String(d.open % 60).padStart(2, '0')}`,
              closes: d.closed
                ? null
                : `${String(Math.floor(d.close / 60)).padStart(2, '0')}:${String(d.close % 60).padStart(2, '0')}`,
            })),
            weekdayNote: '0 = Sunday',
            cancellationNoticeHours: settings.cancellationNoticeHours,
            doctors: doctors.map((d) => ({
              id: d.id,
              name: doctorName(d),
              specialty: d.specialty,
            })),
            appointmentTypes: types
              .filter((t) => !t.isEmergency)
              .map((t) => ({ code: t.code, name: t.name, durationMinutes: t.durationMinutes })),
          },
        };
      },
    }),
    defineTool({
      name: 'find_slots',
      description:
        'Find free slots for a doctor or specialty over up to 14 days. Use a returned startsAt in propose_booking.',
      schema: z.object({
        doctorId: idField.optional(),
        specialty: z.string().optional(),
        fromDate: dateField,
        days: z.number().int().min(1).max(14).optional(),
        type: z.string().optional().describe('Appointment type code (sets the duration)'),
      }),
      personas: ['patient'],
      run: async (input, actor) => {
        if (!input.doctorId && !input.specialty)
          throw new ToolError('Give a doctorId or a specialty');
        let durationMinutes: number | undefined;
        if (input.type) {
          const types = await deps.data.appointmentTypes(actor.clinicId, actor.locale);
          durationMinutes = types.find(
            (t) => t.code === input.type && !t.isEmergency,
          )?.durationMinutes;
        }
        const { timezone, slots } = await deps.data.findSlots(actor.clinicId, {
          doctorId: input.doctorId,
          specialty: input.specialty,
          fromDate: input.fromDate,
          days: input.days ?? 7,
          durationMinutes,
          now: actor.now,
        });
        return { data: { timezone, slots: slots.map((s) => deps.data.slotToJson(s, timezone)) } };
      },
    }),
    defineTool({
      name: 'my_health_summary',
      description:
        'Summaries your clinic published to you and plain-language summaries of your reviewed documents. Not a diagnosis.',
      schema: z.object({}),
      personas: ['patient'],
      run: async (_input, actor) => {
        const patientId = ownPatientId(actor);
        const [summaries, documents] = await Promise.all([
          deps.prisma.patientSummary.findMany({
            where: {
              clinicId: actor.clinicId,
              patientId,
              visibleToPatient: true,
              publishedAt: { not: null },
            },
            orderBy: { publishedAt: 'desc' },
            take: 5,
          }),
          deps.prisma.patientDocument.findMany({
            where: {
              clinicId: actor.clinicId,
              patientId,
              status: 'READY',
              reviewedAt: { not: null },
              ...PATIENT_VISIBLE_DOCUMENTS,
            },
            select: {
              id: true,
              fileName: true,
              category: true,
              documentDate: true,
              extraction: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
        ]);
        return {
          data: {
            // Patients only ever see `patientContent`, never the clinician text.
            summaries: summaries
              .filter((s) => !!s.patientContent?.trim())
              .map((s) => ({
                id: s.id,
                text: s.patientContent,
                publishedAt: s.publishedAt ? toLocalIso(s.publishedAt, actor.timezone) : null,
              })),
            documents: documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              category: d.category,
              documentDate: d.documentDate?.toISOString().slice(0, 10) ?? null,
              summary: (d.extraction as { patientSummary?: string } | null)?.patientSummary ?? null,
            })),
          },
        };
      },
    }),
    defineTool({
      name: 'propose_booking',
      description:
        'Propose booking an appointment for you. Shows a confirmation card; nothing is booked until you confirm. Use a startsAt from find_slots.',
      schema: bookSchema,
      personas: ['patient'],
      run: (input, actor) => proposeBooking(deps, actor, input),
    }),
    defineTool({
      name: 'propose_reschedule',
      description:
        'Propose moving one of your appointments to a free slot. Nothing changes until you confirm.',
      schema: rescheduleSchema,
      personas: ['patient'],
      run: (input, actor) => proposeReschedule(deps, actor, input),
    }),
    defineTool({
      name: 'propose_cancel',
      description:
        'Propose cancelling one of your appointments. Nothing changes until you confirm.',
      schema: cancelSchema,
      personas: ['patient'],
      run: (input, actor) => proposeCancel(deps, actor, input),
    }),
  ];
}
