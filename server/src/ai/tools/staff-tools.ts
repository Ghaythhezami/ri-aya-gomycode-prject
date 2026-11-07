import { z } from 'zod';
import { OPTIMIZATION_OBJECTIVES } from '@riaya/shared';
import { maskPhone, personName } from '../../common/mappers';
import { localDayBounds, localParts } from '../../core/clinic-time';
import { toLocalIso } from '../ai-format';
import { APPT_INCLUDE, apptJson, type ToolDeps } from './tool-deps';
import {
  cancelSchema,
  checkInSchema,
  proposeBooking,
  proposeCancel,
  proposeCheckIn,
  proposeReschedule,
  rescheduleSchema,
  staffBookSchema,
} from './proposals';
import { dateField, defineTool, idField, ToolError, type AssistantTool } from './tool-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reception and clinic-admin tools. Fixed order: the tool list is part of the cached prefix. */
export function staffTools(deps: ToolDeps): AssistantTool[] {
  return [
    defineTool({
      name: 'get_schedule',
      description:
        'List the appointments of one clinic day (optionally one doctor): id, code, times, patient, doctor, status, type.',
      schema: z.object({ date: dateField, doctorId: idField.optional() }),
      capability: 'viewAppointments',
      personas: ['staff'],
      run: async (input, actor) => {
        const { start, end } = localDayBounds(input.date, actor.timezone);
        const rows = await deps.prisma.appointment.findMany({
          where: {
            clinicId: actor.clinicId,
            startsAt: { gte: start, lt: end },
            ...(input.doctorId ? { doctorId: input.doctorId } : {}),
          },
          include: APPT_INCLUDE,
          orderBy: { startsAt: 'asc' },
          take: 80,
        });
        return {
          data: {
            date: input.date,
            timezone: actor.timezone,
            count: rows.length,
            appointments: rows.map((r) => apptJson(r, actor.timezone, true)),
          },
        };
      },
    }),
    defineTool({
      name: 'find_available_slots',
      description:
        'Find free appointment slots for a doctor or a specialty over up to 14 days. Returns startsAt values to use in propose_booking / propose_reschedule.',
      schema: z.object({
        doctorId: idField.optional(),
        specialty: z.string().optional(),
        fromDate: dateField,
        days: z.number().int().min(1).max(14).optional(),
        type: z.string().optional().describe('Appointment type code (sets the duration)'),
      }),
      capability: 'viewDoctors',
      personas: ['staff'],
      run: async (input, actor) => {
        if (!input.doctorId && !input.specialty) {
          throw new ToolError('Give a doctorId or a specialty');
        }
        let durationMinutes: number | undefined;
        if (input.type) {
          const types = await deps.data.appointmentTypes(actor.clinicId, actor.locale);
          durationMinutes = types.find((t) => t.code === input.type)?.durationMinutes;
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
      name: 'search_patients',
      description:
        'Search patients of this clinic by name, code or phone. Returns id, code, name, birth date, masked phone. Never clinical notes. Use it to get the patientId other tools need.',
      schema: z.object({ query: z.string().min(2).max(100) }),
      capability: 'viewPatients',
      // Doctors need it too: their patient tools take an id, users give a name.
      personas: ['staff', 'doctor'],
      run: async (input, actor) => {
        const terms = input.query.trim().split(/\s+/).filter(Boolean);
        const rows = await deps.prisma.patient.findMany({
          where: {
            clinicId: actor.clinicId,
            status: 'ACTIVE',
            OR: [
              {
                AND: terms.map((t) => ({
                  searchText: { contains: t.toLowerCase(), mode: 'insensitive' as const },
                })),
              },
              { code: { contains: input.query.trim(), mode: 'insensitive' } },
              { phone: { contains: input.query.trim() } },
            ],
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          take: 8,
        });
        return {
          data: {
            patients: rows.map((p) => ({
              id: p.id,
              code: p.code,
              name: personName(p),
              dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10),
              phone: maskPhone(p.phone),
            })),
          },
        };
      },
    }),
    defineTool({
      name: 'get_appointment',
      description: 'Get one appointment by id or by its code (for example AP-1001).',
      schema: z.object({ idOrCode: z.string().min(3).max(64) }),
      capability: 'viewAppointments',
      personas: ['staff'],
      run: async (input, actor) => {
        const key = input.idOrCode.trim();
        const row = await deps.prisma.appointment.findFirst({
          where: { clinicId: actor.clinicId, ...(UUID.test(key) ? { id: key } : { code: key }) },
          include: APPT_INCLUDE,
        });
        if (!row) throw new ToolError('Appointment not found');
        return { data: apptJson(row, actor.timezone, true) };
      },
    }),
    defineTool({
      name: 'list_alerts',
      description:
        'Things needing attention: unread notifications, appointments flagged for rescheduling, and upcoming appointments in hours with a high historical no-show rate (when the analytics service runs).',
      schema: z.object({}),
      capability: 'viewNotifications',
      personas: ['staff'],
      run: async (_input, actor) => {
        const tz = actor.timezone;
        const notifications = await deps.notifications.list(actor.clinicId, actor.userId!, {
          unread: true,
          limit: 10,
        });
        const conflicts = await deps.prisma.appointment.findMany({
          where: {
            clinicId: actor.clinicId,
            needsReschedule: true,
            startsAt: { gte: actor.now },
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
          },
          include: APPT_INCLUDE,
          orderBy: { startsAt: 'asc' },
          take: 10,
        });
        // Explicit status so the model never mistakes "no risky hours" for an outage.
        let noShowRisk: unknown = { status: 'unavailable' };
        const insights = deps.insights();
        if (insights && actor.userId && actor.role) {
          try {
            const result = await insights.insights(
              {
                userId: actor.userId,
                clinicId: actor.clinicId,
                role: actor.role,
                organizationId: '',
                membershipId: '',
              },
              {},
            );
            const base = result.totals.noShowRate;
            const hot = new Set(
              result.noShow.byHour
                .filter((h) => h.count >= 5 && h.rate >= Math.max(0.15, base * 1.5))
                .map((h) => Number(h.key)),
            );
            noShowRisk = { status: 'ok', overallRate: base, hotHours: [], appointments: [] };
            if (hot.size) {
              const upcoming = await deps.prisma.appointment.findMany({
                where: {
                  clinicId: actor.clinicId,
                  startsAt: { gte: actor.now, lt: new Date(actor.now.getTime() + 48 * 3600_000) },
                  status: { in: ['SCHEDULED', 'CONFIRMED'] },
                },
                include: APPT_INCLUDE,
                orderBy: { startsAt: 'asc' },
                take: 100,
              });
              noShowRisk = {
                status: 'ok',
                overallRate: base,
                hotHours: [...hot],
                appointments: upcoming
                  .filter((a) => hot.has(localParts(a.startsAt, tz).hour))
                  .slice(0, 10)
                  .map((a) => apptJson(a, tz, true)),
              };
            }
          } catch {
            noShowRisk = { status: 'unavailable' }; // analytics service down: alerts still work
          }
        }
        return {
          data: {
            unreadNotifications: notifications.unreadCount,
            notifications: notifications.items.map((n) => ({
              id: n.id,
              category: n.category,
              titleKey: n.titleKey,
              params: n.params,
              entityType: n.entityType,
              entityId: n.entityId,
              createdAt: toLocalIso(new Date(n.createdAt), tz),
            })),
            needsReschedule: conflicts.map((a) => apptJson(a, tz, true)),
            noShowRisk,
          },
        };
      },
    }),
    defineTool({
      name: 'queue_status',
      description: 'Live waiting-room status: counts, waits and the queue entries.',
      schema: z.object({}),
      capability: 'viewWaitingList',
      personas: ['staff'],
      run: async (_input, actor) => {
        const snap = await deps.queue.snapshot(actor.clinicId, actor.now);
        return {
          data: {
            summary: snap.summary,
            entries: snap.entries.slice(0, 40).map((e) => ({
              number: e.number,
              appointmentId: e.appointmentId,
              appointmentCode: e.appointmentCode,
              patient: e.patient.name,
              doctor: e.doctor.name,
              status: e.status,
              priority: e.priority,
              waitingMinutes: e.waitingMinutes,
              overTarget: e.overTarget,
            })),
            notCheckedIn: snap.expected.slice(0, 20).map((a) => ({
              appointmentId: a.id,
              code: a.code,
              patient: a.patient.name,
              doctor: a.doctor.name,
              startsAt: toLocalIso(new Date(a.startsAt), actor.timezone),
            })),
          },
        };
      },
    }),
    defineTool({
      name: 'optimizer_preview',
      description:
        'Preview what the smart scheduler would change for a day (read-only, nothing is saved or applied).',
      schema: z.object({ date: dateField, objective: z.enum(OPTIMIZATION_OBJECTIVES) }),
      capability: 'viewScheduling',
      personas: ['staff'],
      run: async (input, actor) => {
        const ctx = await deps.scheduling.loadContext(actor.clinicId, input.date);
        const { result } = await deps.scheduling.runOptimizerPreferred(
          actor.clinicId,
          ctx,
          input.objective,
          actor.now,
        );
        return {
          data: {
            date: input.date,
            status: result.status,
            before: result.before,
            after: result.after,
            moves: result.moves.slice(0, 15).map((m) => ({
              appointmentId: m.appointmentId,
              code: m.code,
              fromDoctorId: m.fromDoctorId,
              toDoctorId: m.toDoctorId,
              from: toLocalIso(new Date(m.fromStart), actor.timezone),
              to: toLocalIso(new Date(m.toStart), actor.timezone),
            })),
            moveCount: result.moves.length,
            unresolved: result.unresolved.length,
          },
        };
      },
    }),
    defineTool({
      name: 'propose_booking',
      description:
        'Propose booking an appointment for a patient. Shows the user a confirmation card; nothing is booked until they confirm. Use ids and a startsAt from find_available_slots.',
      schema: staffBookSchema,
      capability: 'manageAppointments',
      personas: ['staff'],
      run: (input, actor) => proposeBooking(deps, actor, input),
    }),
    defineTool({
      name: 'propose_reschedule',
      description:
        'Propose moving an appointment to a free slot. The user must confirm; nothing changes until then.',
      schema: rescheduleSchema,
      capability: 'manageAppointments',
      personas: ['staff'],
      run: (input, actor) => proposeReschedule(deps, actor, input),
    }),
    defineTool({
      name: 'propose_cancel',
      description:
        'Propose cancelling an appointment. The user must confirm; nothing changes until then.',
      schema: cancelSchema,
      capability: 'manageAppointments',
      personas: ['staff'],
      run: (input, actor) => proposeCancel(deps, actor, input),
    }),
    defineTool({
      name: 'propose_check_in',
      description: 'Propose checking in a patient who arrived for a same-day appointment.',
      schema: checkInSchema,
      capability: 'manageQueue',
      personas: ['staff'],
      run: (input, actor) => proposeCheckIn(deps, actor, input),
    }),
  ];
}
