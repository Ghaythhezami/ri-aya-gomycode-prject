import type {
  AppointmentDetail,
  MoveValidation,
  OptimizationObjective,
  OptimizationProposal,
  SchedulingDay,
  UpdateAppointmentInput,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

const schedulingApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    schedulingDay: build.query<SchedulingDay, { date: string }>({
      query: ({ date }) => ({ url: '/api/scheduling/day', params: { date } }),
      providesTags: ['Schedule'],
    }),
    schedulingValidateMove: build.mutation<
      MoveValidation,
      { appointmentId: string; doctorId: string; startsAt: string }
    >({
      query: (body) => ({ url: '/api/scheduling/validate-move', method: 'POST', body }),
    }),
    schedulingOptimize: build.mutation<
      OptimizationProposal,
      { date: string; objective: OptimizationObjective }
    >({
      query: (body) => ({ url: '/api/scheduling/optimize', method: 'POST', body }),
    }),
    schedulingApply: build.mutation<OptimizationProposal, string>({
      query: (id) => ({ url: `/api/scheduling/proposals/${id}/apply`, method: 'POST' }),
      invalidatesTags: ['Schedule', 'Appointment', 'Dashboard'],
    }),
    schedulingUndo: build.mutation<OptimizationProposal, string>({
      query: (id) => ({ url: `/api/scheduling/proposals/${id}/undo`, method: 'POST' }),
      invalidatesTags: ['Schedule', 'Appointment', 'Dashboard'],
    }),
    schedulingReschedule: build.mutation<
      AppointmentDetail,
      { id: string; changes: UpdateAppointmentInput }
    >({
      query: ({ id, changes }) => ({
        url: `/api/appointments/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      // Tags are invalidated once after the whole batch (see `invalidateSchedule`).
    }),
  }),
});

export const {
  useSchedulingDayQuery,
  useSchedulingValidateMoveMutation,
  useSchedulingOptimizeMutation,
  useSchedulingApplyMutation,
  useSchedulingUndoMutation,
  useSchedulingRescheduleMutation,
} = schedulingApi;

/** Tags refreshed after a saved manual change. */
export const SCHEDULE_TAGS = ['Schedule', 'Appointment', 'Dashboard'] as const;
export { schedulingApi };
